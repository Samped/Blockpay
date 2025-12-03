// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title JobPool
 * @dev Escrow contract for freelance work with watermarked submissions
 * @dev Integrated with Intuition MultiVault for knowledge graph representation
 */

interface IMultiVault {
    function createAtoms(bytes[] calldata data, uint256[] calldata assets) external payable returns (bytes32[] memory);
    function createTriples(bytes32[] calldata subjectIds, bytes32[] calldata predicateIds, bytes32[] calldata objectIds, uint256[] calldata assets) external payable returns (bytes32[] memory);
}

contract JobPool {
    // Ownership & fees
    address public platformOwner;
    uint256 public platformFeePercent = 250; // 2.5% basis points
    uint256 private constant BASIS_POINTS = 10000;

    IMultiVault public immutable multivault;

    // Atom fee (default 0.1 TRUST) -- owner-changeable only via timelocked scheduling
    uint256 public atomCreationFee = 0.1 ether;

    // Limits & durations
    uint256 public constant MIN_JOB_PAYMENT = 0.01 ether; // 0.01 TRUST
    uint256 public constant MIN_DEADLINE_DURATION = 1 hours;
    uint256 public constant MAX_DEADLINE_DURATION = 365 days; // Maximum 1 year
    uint256 public constant MIN_ACCEPT_DELAY = 1 hours; // protect early submitters
    uint256 public constant OWNER_CHANGE_DELAY = 1 days;
    uint256 public constant PLATFORM_FEE_CHANGE_DELAY = 1 days;
    uint256 public constant MIN_WORKER_PAYMENT = 1 wei; // Minimum payment to worker

    uint256 public maxSubmissionsPerJob = 100;
    uint256 public constant MAX_SUBMISSIONS_LIMIT = 100; // Maximum allowed submissions per job
    bool public paused;

    // Reentrancy
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    // Accounting
    mapping(address => uint256) public pendingWithdrawals;
    uint256 public totalJobEscrow;        // Total funds locked in active jobs
    uint256 public totalPendingWithdrawals; // Total funds ready for withdrawal

    // MultiVault atoms for jobs/submissions/payments
    mapping(uint256 => bytes32) public jobAtomIds;
    mapping(uint256 => mapping(uint256 => bytes32)) public submissionAtomIds;
    mapping(uint256 => mapping(uint256 => bytes32)) public paymentAtomIds;

    // Predicates (optional - created lazily if needed)
    bytes32 public hasSubmissionPredicate;
    bytes32 public paidOutAsPredicate;
    bytes32 public upvotedPredicate;

    enum JobStatus { Active, Completed, Cancelled, Expired }

    struct Submission {
        address worker;
        bytes32 submissionHash;
        bool accepted;
        bool withdrawn;
        uint256 timestamp;
    }

    struct Job {
        address creator;
        uint256 payment; // escrowed TRUST
        uint256 deadline;
        JobStatus status;
        Submission[] submissions;
        uint256 activeSubmissionsCount; // tracks non-withdrawn submissions
        uint256 platformFeeAtCreation;  // locked platform fee basis points
        string jobMetaHash; // optional IPFS/Arweave hash for job description
    }

    mapping(uint256 => Job) public jobs;
    uint256 public jobCount;

    // Upvote tracking: jobId => user => hasUpvoted
    mapping(uint256 => mapping(address => bool)) public hasUpvoted;

    // Timelock storage for owner/platform changes
    address public pendingOwner;
    uint256 public ownershipTransferETA;

    uint256 public pendingPlatformFeePercent;
    uint256 public platformFeeChangeETA;

    uint256 public pendingAtomFee;
    uint256 public atomFeeChangeETA;

    // Events
    event JobCreated(uint256 indexed jobId, address indexed creator, uint256 payment, uint256 deadline, bytes32 jobAtomId);
    event WorkSubmitted(uint256 indexed jobId, uint256 indexed submissionId, address indexed worker, bytes32 submissionHash, bytes32 submissionAtomId);
    event SubmissionWithdrawn(uint256 indexed jobId, uint256 indexed submissionId, address indexed worker);
    event JobCompleted(uint256 indexed jobId, address indexed worker, uint256 workerPayment, uint256 platformFee, bytes32 paymentAtomId);
    event JobCancelled(uint256 indexed jobId, address indexed creator, uint256 refund);
    event JobExpired(uint256 indexed jobId, address indexed creator, uint256 refund);
    event PlatformFeeChangeScheduled(uint256 newFee, uint256 eta);
    event PlatformFeeChangeExecuted(uint256 oldFee, uint256 newFee);
    event OwnershipTransferScheduled(address indexed newOwner, uint256 eta);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AtomFeeChangeScheduled(uint256 newFee, uint256 eta);
    event AtomFeeChangeExecuted(uint256 oldFee, uint256 newFee);
    event SurplusRefunded(address indexed to, uint256 amount);
    event SurplusCredited(address indexed to, uint256 amount);
    event Paused(address account);
    event Unpaused(address account);
    event PauseExecuted(address account);
    event UnpauseExecuted(address account);
    event ScheduledChangeCancelled(string changeType, uint256 timestamp);
    event MaxSubmissionsUpdated(uint256 oldMax, uint256 newMax);
    event PredicatesInitialized(bytes32 hasSubmission, bytes32 paidOutAs);
    event JobUpvoted(uint256 indexed jobId, address indexed upvoter, bytes32 userAtomId, bytes32 tripleId);

    // Modifiers
    modifier onlyPlatformOwner() {
        require(msg.sender == platformOwner, "Not platform owner");
        _;
    }

    modifier nonReentrant() {
        require(_status != ENTERED, "Reentrant");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Not paused");
        _;
    }

    constructor(address _multivault) {
        require(_multivault != address(0), "Invalid multivault");
        platformOwner = msg.sender;
        multivault = IMultiVault(_multivault);
        _status = NOT_ENTERED;
        paused = false;
    }

    // ---------- OWNER TIMELLOCKED ACTIONS ----------

    /// Schedule platform fee change (timelocked)
    function schedulePlatformFeeChange(uint256 _newFee) external onlyPlatformOwner {
        require(_newFee <= 1000, "Max 10%");
        pendingPlatformFeePercent = _newFee;
        platformFeeChangeETA = block.timestamp + PLATFORM_FEE_CHANGE_DELAY;
        emit PlatformFeeChangeScheduled(_newFee, platformFeeChangeETA);
    }

    function executePlatformFeeChange() external onlyPlatformOwner {
        require(platformFeeChangeETA != 0 && block.timestamp >= platformFeeChangeETA, "Too early");
        require(pendingPlatformFeePercent <= 1000, "Fee too high"); // Validate range
        uint256 old = platformFeePercent;
        platformFeePercent = pendingPlatformFeePercent;
        pendingPlatformFeePercent = 0;
        platformFeeChangeETA = 0;
        emit PlatformFeeChangeExecuted(old, platformFeePercent);
    }

    /// Schedule atom fee change
    function scheduleAtomFeeChange(uint256 _newFee) external onlyPlatformOwner {
        require(_newFee > 0, "Fee must be > 0");
        require(_newFee <= 1 ether, "Fee too high"); // Reasonable upper bound (1 TRUST)
        pendingAtomFee = _newFee;
        atomFeeChangeETA = block.timestamp + PLATFORM_FEE_CHANGE_DELAY;
        emit AtomFeeChangeScheduled(_newFee, atomFeeChangeETA);
    }

    function executeAtomFeeChange() external onlyPlatformOwner {
        require(atomFeeChangeETA != 0 && block.timestamp >= atomFeeChangeETA, "Too early");
        require(pendingAtomFee > 0, "Invalid fee"); // Ensure fee is non-zero
        uint256 old = atomCreationFee;
        atomCreationFee = pendingAtomFee;
        pendingAtomFee = 0;
        atomFeeChangeETA = 0;
        emit AtomFeeChangeExecuted(old, atomCreationFee);
    }

    /// Cancel scheduled atom fee change
    function cancelAtomFeeChange() external onlyPlatformOwner {
        require(atomFeeChangeETA != 0, "No scheduled change");
        pendingAtomFee = 0;
        atomFeeChangeETA = 0;
        emit ScheduledChangeCancelled("atomFee", block.timestamp);
    }

    /// Cancel scheduled platform fee change
    function cancelPlatformFeeChange() external onlyPlatformOwner {
        require(platformFeeChangeETA != 0, "No scheduled change");
        pendingPlatformFeePercent = 0;
        platformFeeChangeETA = 0;
        emit ScheduledChangeCancelled("platformFee", block.timestamp);
    }

    /// Cancel scheduled ownership transfer
    function cancelOwnershipTransfer() external onlyPlatformOwner {
        require(ownershipTransferETA != 0, "No scheduled transfer");
        pendingOwner = address(0);
        ownershipTransferETA = 0;
        emit ScheduledChangeCancelled("ownership", block.timestamp);
    }

    /// Set maximum submissions per job
    function setMaxSubmissionsPerJob(uint256 _max) external onlyPlatformOwner {
        require(_max > 0 && _max <= MAX_SUBMISSIONS_LIMIT, "Invalid max submissions");
        uint256 old = maxSubmissionsPerJob;
        maxSubmissionsPerJob = _max;
        emit MaxSubmissionsUpdated(old, _max);
    }

    /// Two-step ownership transfer with timelock (owner schedules transfer; new owner accepts after ETA)
    function scheduleOwnershipTransfer(address _newOwner) external onlyPlatformOwner {
        require(_newOwner != address(0), "Zero address");
        require(_newOwner != platformOwner, "Already owner");
        pendingOwner = _newOwner;
        ownershipTransferETA = block.timestamp + OWNER_CHANGE_DELAY;
        emit OwnershipTransferScheduled(_newOwner, ownershipTransferETA);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        require(ownershipTransferETA != 0 && block.timestamp >= ownershipTransferETA, "Too early");
        address old = platformOwner;
        platformOwner = pendingOwner;
        pendingOwner = address(0);
        ownershipTransferETA = 0;
        emit OwnershipTransferred(old, platformOwner);
    }

    // ---------- PAUSE/UNPAUSE ----------
    function pause() external onlyPlatformOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
        emit PauseExecuted(msg.sender);
    }

    function unpause() external onlyPlatformOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
        emit UnpauseExecuted(msg.sender);
    }

    // ---------- JOB LIFECYCLE ----------

    /**
     * createJob:
     * caller provides explicit jobPayment and sends msg.value >= jobPayment + atomCreationFee.
     * surplus refunded.
     */
    function createJob(uint256 _deadline, uint256 _jobPayment, string calldata _jobMetaHash)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        require(_deadline > block.timestamp + MIN_DEADLINE_DURATION, "Deadline too soon");
        require(_deadline <= block.timestamp + MAX_DEADLINE_DURATION, "Deadline too far");
        require(_jobPayment >= MIN_JOB_PAYMENT, "Minimum job payment required");

        // If predicates are not initialized yet, first job creator also pays for them
        bool initializingPredicates = (hasSubmissionPredicate == bytes32(0) || paidOutAsPredicate == bytes32(0) || upvotedPredicate == bytes32(0));
        uint256 predicateCount = 0;
        if (hasSubmissionPredicate == bytes32(0)) predicateCount++;
        if (paidOutAsPredicate == bytes32(0)) predicateCount++;
        if (upvotedPredicate == bytes32(0)) predicateCount++;
        uint256 predicateCost = initializingPredicates ? atomCreationFee * predicateCount : 0;

        // job payment + 1 job atom + optional 2 predicate atoms
        uint256 required = _jobPayment + atomCreationFee + predicateCost;
        require(msg.value >= required, "Insufficient msg.value for payment+atoms");

        // Increment jobCount first to get correct ID
        jobCount += 1;
        uint256 currentJobId = jobCount;

        // Lazily initialize predicates on first job if needed (creator pays via msg.value)
        if (initializingPredicates) {
            _ensurePredicatesInitialized();
        }

        // Create job atom strictly: forward exactly atomCreationFee from this call
        bytes32 jobAtom = _createJobAtomStrict(currentJobId, msg.sender, _jobPayment, _deadline, atomCreationFee);

        // persist job
        Job storage j = jobs[currentJobId];
        j.creator = msg.sender;
        j.payment = _jobPayment;
        j.deadline = _deadline;
        j.status = JobStatus.Active;
        j.activeSubmissionsCount = 0;
        j.platformFeeAtCreation = platformFeePercent;
        j.jobMetaHash = _jobMetaHash;

        // Update accounting
        totalJobEscrow += _jobPayment;

        jobAtomIds[currentJobId] = jobAtom;
        emit JobCreated(currentJobId, msg.sender, _jobPayment, _deadline, jobAtom);

        // refund surplus if any (after accounting for job payment + all atoms)
        uint256 surplus = msg.value - required;
        if (surplus > 0) _safeRefundOrCredit(msg.sender, surplus);

        return currentJobId;
    }

    /**
     * submitWork:
     * submitter must send >= 2 * atomCreationFee (one for submission atom + one for job->submission triple)
     * surplus refunded.
     */
    function submitWork(uint256 _jobId, bytes32 _submissionHash)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid job");
        require(_submissionHash != bytes32(0), "Zero hash");

        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job not active");
        require(block.timestamp < job.deadline, "Deadline passed");
        require(msg.sender != job.creator, "Creator cannot submit");
        require(job.activeSubmissionsCount < maxSubmissionsPerJob, "Max submissions reached");

        uint256 needed = atomCreationFee * 2;
        require(msg.value >= needed, "Send 2 * atomCreationFee");

        // Create submission atom (forward atomCreationFee)
        uint256 submissionId = job.submissions.length;
        bytes32 submissionAtom = _createSubmissionAtomStrict(_jobId, submissionId, msg.sender, _submissionHash, atomCreationFee);

        // Create job->submission triple (forward atomCreationFee)
        bytes32 jobAtom = jobAtomIds[_jobId];
        require(jobAtom != bytes32(0), "Job atom missing");
        _createJobSubmissionTripleStrict(jobAtom, submissionAtom, atomCreationFee);

        // persist submission
        job.submissions.push(Submission({
            worker: msg.sender,
            submissionHash: _submissionHash,
            accepted: false,
            withdrawn: false,
            timestamp: block.timestamp
        }));
        submissionAtomIds[_jobId][submissionId] = submissionAtom;
        job.activeSubmissionsCount += 1;

        emit WorkSubmitted(_jobId, submissionId, msg.sender, _submissionHash, submissionAtom);

        // refund surplus if any
        uint256 surplus = msg.value - needed;
        if (surplus > 0) _safeRefundOrCredit(msg.sender, surplus);
    }

    /**
     * withdrawSubmission: worker withdraws before acceptance; frees a slot
     */
    function withdrawSubmission(uint256 _jobId, uint256 _submissionId) external whenNotPaused nonReentrant {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid job");
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job not active");
        require(_submissionId < job.submissions.length, "Invalid submission id");

        Submission storage s = job.submissions[_submissionId];
        require(s.worker == msg.sender, "Not owner");
        require(!s.accepted, "Already accepted");
        require(!s.withdrawn, "Already withdrawn");
        require(job.activeSubmissionsCount > 0, "No active submissions");

        s.withdrawn = true;
        job.activeSubmissionsCount -= 1;
        emit SubmissionWithdrawn(_jobId, _submissionId, msg.sender);
    }

    /**
     * acceptWork: creator accepts a submission
     * creator must send >= 2 * atomCreationFee (payment atom + triple).
     * Platform fee is taken from job.payment using job.platformFeeAtCreation.
     * Enforce MIN_ACCEPT_DELAY to reduce front-running risk.
     */
    function acceptWork(uint256 _jobId, uint256 _submissionId)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid job");
        Job storage job = jobs[_jobId];
        require(msg.sender == job.creator, "Only creator");
        require(job.status == JobStatus.Active, "Job not active");
        require(_submissionId < job.submissions.length, "Invalid submission id");

        Submission storage s = job.submissions[_submissionId];
        require(!s.accepted, "Already accepted");
        require(!s.withdrawn, "Withdrawn");
        require(block.timestamp >= s.timestamp + MIN_ACCEPT_DELAY, "Accept too soon");

        uint256 needed = atomCreationFee * 2;
        require(msg.value >= needed, "Send 2 * atomCreationFee");

        // compute payouts using locked platform fee
        uint256 platformFee = (job.payment * job.platformFeeAtCreation) / BASIS_POINTS;
        uint256 workerPayment = job.payment - platformFee;
        
        // Ensure minimum worker payment
        if (workerPayment < MIN_WORKER_PAYMENT) {
            require(job.payment >= MIN_WORKER_PAYMENT + 1, "Job payment too small for minimum worker payment");
            platformFee = job.payment - MIN_WORKER_PAYMENT;
            workerPayment = MIN_WORKER_PAYMENT;
        } else if (platformFee == 0 && job.payment > MIN_WORKER_PAYMENT) {
            // Take minimum platform fee if payment is large enough and fee would be 0
            platformFee = 1;
            workerPayment = job.payment - 1;
        }

        // Create payment atom & triple (strict)
        bytes32 paymentAtom = _createPaymentAtomStrict(_jobId, _submissionId, s.worker, workerPayment, platformFee, atomCreationFee);
        bytes32 submissionAtom = submissionAtomIds[_jobId][_submissionId];
        require(submissionAtom != bytes32(0), "Submission atom missing");
        _createPaymentTripleStrict(submissionAtom, paymentAtom, atomCreationFee);

        // State changes: mark accepted and move escrow to pendingWithdrawals
        job.status = JobStatus.Completed;
        s.accepted = true;
        job.activeSubmissionsCount -= 1;

        // Update accounting: move from escrow to pending withdrawals
        totalJobEscrow -= job.payment;
        totalPendingWithdrawals += workerPayment + platformFee;

        pendingWithdrawals[s.worker] += workerPayment;
        pendingWithdrawals[platformOwner] += platformFee;

        // zero the job payment to avoid double spend
        job.payment = 0;

        paymentAtomIds[_jobId][_submissionId] = paymentAtom;
        emit JobCompleted(_jobId, s.worker, workerPayment, platformFee, paymentAtom);

        // refund surplus msg.value to creator
        uint256 surplus = msg.value - needed;
        if (surplus > 0) _safeRefundOrCredit(msg.sender, surplus);
    }

    // cancel / expire / emergency
    function cancelJob(uint256 _jobId) external whenNotPaused nonReentrant {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid");
        Job storage job = jobs[_jobId];
        require(msg.sender == job.creator, "Only creator");
        require(job.status == JobStatus.Active, "Job not active");
        require(job.activeSubmissionsCount == 0, "Cannot cancel with active submissions");

        job.status = JobStatus.Cancelled;
        uint256 refund = job.payment;
        job.payment = 0;
        
        // Update accounting
        totalJobEscrow -= refund;
        totalPendingWithdrawals += refund;
        
        pendingWithdrawals[job.creator] += refund;
        emit JobCancelled(_jobId, job.creator, refund);
    }

    function expireJob(uint256 _jobId) external whenNotPaused nonReentrant {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid");
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job not active");
        require(block.timestamp > job.deadline, "Deadline not passed");

        job.status = JobStatus.Expired;
        uint256 refund = job.payment;
        job.payment = 0;
        
        // Update accounting
        totalJobEscrow -= refund;
        totalPendingWithdrawals += refund;
        
        pendingWithdrawals[job.creator] += refund;
        emit JobExpired(_jobId, job.creator, refund);
    }

    // ---------- Upvote Function ----------
    /**
     * @notice Upvote a job by creating a triple: userAtom -> upvotedPredicate -> jobAtom
     * @param _jobId The job ID to upvote
     * @param _userAtomId The user's atom ID (term_id) from Intuition Knowledge Graph
     * @dev Requires msg.value = atomCreationFee (0.1 TRUST) for triple creation
     * @dev Users must have created their User atom first (via UserInitialization)
     */
    function upvoteJob(uint256 _jobId, bytes32 _userAtomId) external payable whenNotPaused nonReentrant {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid job ID");
        require(_userAtomId != bytes32(0), "Invalid user atom ID");
        require(!hasUpvoted[_jobId][msg.sender], "Already upvoted");
        require(msg.value == atomCreationFee, "Send exactly atomCreationFee");

        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active || job.status == JobStatus.Completed, "Job not upvotable");

        bytes32 jobAtomId = jobAtomIds[_jobId];
        require(jobAtomId != bytes32(0), "Job atom not found");

        // Ensure predicates are initialized
        if (upvotedPredicate == bytes32(0)) {
            _ensurePredicatesInitialized();
        }
        require(upvotedPredicate != bytes32(0), "Upvoted predicate not initialized");

        // Create triple: userAtom -> upvotedPredicate -> jobAtom
        bytes32[] memory subjects = new bytes32[](1);
        bytes32[] memory predicates = new bytes32[](1);
        bytes32[] memory objects = new bytes32[](1);
        subjects[0] = _userAtomId;
        predicates[0] = upvotedPredicate;
        objects[0] = jobAtomId;

        // Create the triple (this will revert if it fails)
        _createTriplesStrict(subjects, predicates, objects, atomCreationFee, "Upvote triple creation failed");

        // Mark as upvoted
        hasUpvoted[_jobId][msg.sender] = true;

        // Get the triple ID (we can't get it from createTriples, but we emit the event)
        emit JobUpvoted(_jobId, msg.sender, _userAtomId, bytes32(0)); // tripleId not available from MultiVault
    }

    function emergencyCancelJob(uint256 _jobId) external onlyPlatformOwner whenNotPaused nonReentrant {
        require(_jobId > 0 && _jobId <= jobCount, "Invalid");
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Not cancellable");

        job.status = JobStatus.Cancelled;
        uint256 refund = job.payment;
        job.payment = 0;
        
        // Reset active submissions count
        job.activeSubmissionsCount = 0;
        
        // Update accounting
        totalJobEscrow -= refund;
        totalPendingWithdrawals += refund;
        
        pendingWithdrawals[job.creator] += refund;
        emit JobCancelled(_jobId, job.creator, refund);
    }

    // ---------- Withdraw ----------
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds");
        
        // Update accounting before external call
        pendingWithdrawals[msg.sender] = 0;
        totalPendingWithdrawals -= amount;
        
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    // ---------- View Functions ----------
    
    /**
     * @notice Get contract accounting breakdown
     * @return totalBalance Total contract balance
     * @return totalEscrow Total funds locked in active jobs
     * @return totalPending Total funds ready for withdrawal
     * @return available Available balance (total - escrow - pending)
     */
    function getAccounting() external view returns (
        uint256 totalBalance,
        uint256 totalEscrow,
        uint256 totalPending,
        uint256 available
    ) {
        totalBalance = address(this).balance;
        totalEscrow = totalJobEscrow;
        totalPending = totalPendingWithdrawals;
        
        if (totalBalance >= totalEscrow + totalPending) {
            available = totalBalance - totalEscrow - totalPending;
        } else {
            available = 0;
        }
    }

    /**
     * @notice Verify accounting consistency by recalculating escrow from active jobs
     * @return calculatedEscrow Sum of payments from all active jobs
     * @return storedEscrow Value stored in totalJobEscrow
     * @return isConsistent Whether calculated and stored values match
     */
    function verifyAccountingConsistency() external view returns (
        uint256 calculatedEscrow,
        uint256 storedEscrow,
        bool isConsistent
    ) {
        calculatedEscrow = 0;
        for (uint256 i = 1; i <= jobCount; i++) {
            Job memory job = jobs[i];
            if (job.status == JobStatus.Active) {
                calculatedEscrow += job.payment;
            }
        }
        storedEscrow = totalJobEscrow;
        isConsistent = (calculatedEscrow == storedEscrow);
    }

    // ---------- MultiVault helpers (strict - reverts on failure) ----------
    function _createAtomWithDataStrict(bytes memory data, uint256 valueToForward, string memory errPrefix) internal returns (bytes32) {
        require(valueToForward == atomCreationFee, "Forward exactly atomCreationFee");
        bytes[] memory arr = new bytes[](1);
        arr[0] = data;
        uint256[] memory assets = new uint256[](1);
        // MultiVault requires: msg.value == sum(assets[])
        // So we set assets[0] = atomCreationFee and msg.value = atomCreationFee
        assets[0] = valueToForward;

        try multivault.createAtoms{value: valueToForward}(arr, assets) returns (bytes32[] memory ids) {
            require(ids.length > 0 && ids[0] != bytes32(0), string(abi.encodePacked(errPrefix, ": invalid id")));
            return ids[0];
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked(errPrefix, ": ", reason)));
        } catch {
            revert(string(abi.encodePacked(errPrefix, ": createAtoms failed")));
        }
    }

    function _createTriplesStrict(bytes32[] memory subjects, bytes32[] memory predicates, bytes32[] memory objects, uint256 valueToForward, string memory errPrefix) internal {
        require(valueToForward == atomCreationFee, "Forward exactly atomCreationFee");
        uint256[] memory assets = new uint256[](1);
        // MultiVault requires: msg.value == sum(assets[])
        // So we set assets[0] = atomCreationFee and msg.value = atomCreationFee
        assets[0] = valueToForward;
        try multivault.createTriples{value: valueToForward}(subjects, predicates, objects, assets) returns (bytes32[] memory) {
            return; // Success
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked(errPrefix, ": ", reason)));
        } catch {
            revert(string(abi.encodePacked(errPrefix, ": createTriples failed")));
        }
    }

    // wrappers
    function _createJobAtomStrict(uint256 jobId, address creator, uint256 payment, uint256 deadline, uint256 valueToForward) internal returns (bytes32) {
        bytes memory data = abi.encodePacked('{"type":"job","jobId":', _u(jobId), ',"creator":"', _a(creator), '","payment":"', _u(payment), '","deadline":', _u(deadline), "}");
        return _createAtomWithDataStrict(data, valueToForward, "Job atom creation failed");
    }

    function _createSubmissionAtomStrict(uint256 jobId, uint256 subId, address worker, bytes32 hash, uint256 valueToForward) internal returns (bytes32) {
        bytes memory data = abi.encodePacked('{"type":"submission","jobId":', _u(jobId), ',"submissionId":', _u(subId), ',"worker":"', _a(worker), '","submissionHash":"', _b(hash), '"}');
        return _createAtomWithDataStrict(data, valueToForward, "Submission atom creation failed");
    }

    function _createPaymentAtomStrict(uint256 jobId, uint256 subId, address worker, uint256 workerPayment, uint256 platformFee, uint256 valueToForward) internal returns (bytes32) {
        bytes memory data = abi.encodePacked('{"type":"payment","jobId":', _u(jobId), ',"submissionId":', _u(subId), ',"worker":"', _a(worker), '","workerPayment":"', _u(workerPayment), '","platformFee":"', _u(platformFee), '"}');
        return _createAtomWithDataStrict(data, valueToForward, "Payment atom creation failed");
    }

    function _createPredicateAtomStrict(string memory name, uint256 valueToForward) internal returns (bytes32) {
        bytes memory data = abi.encodePacked('{"type":"predicate","name":"', name, '"}');
        return _createAtomWithDataStrict(data, valueToForward, "Predicate atom creation failed");
    }

    /// @dev Lazily initialize predicates; called from createJob on first job
    function _ensurePredicatesInitialized() internal {
        if (hasSubmissionPredicate != bytes32(0) && paidOutAsPredicate != bytes32(0) && upvotedPredicate != bytes32(0)) {
            return;
        }

        if (hasSubmissionPredicate == bytes32(0)) {
            bytes32 p1 = _createPredicateAtomStrict("hasSubmission", atomCreationFee);
            require(p1 != bytes32(0), "Failed to create hasSubmission predicate");
            hasSubmissionPredicate = p1;
        }

        if (paidOutAsPredicate == bytes32(0)) {
            bytes32 p2 = _createPredicateAtomStrict("paidOutAs", atomCreationFee);
            require(p2 != bytes32(0), "Failed to create paidOutAs predicate");
            paidOutAsPredicate = p2;
        }

        if (upvotedPredicate == bytes32(0)) {
            bytes32 p3 = _createPredicateAtomStrict("upvoted", atomCreationFee);
            require(p3 != bytes32(0), "Failed to create upvoted predicate");
            upvotedPredicate = p3;
        }

        emit PredicatesInitialized(hasSubmissionPredicate, paidOutAsPredicate);
    }

    function _createJobSubmissionTripleStrict(bytes32 jobAtom, bytes32 submissionAtom, uint256 valueToForward) internal {
        // If predicates or atoms are not set, skip triple creation (contract logic still works)
        if (hasSubmissionPredicate == bytes32(0) || jobAtom == bytes32(0) || submissionAtom == bytes32(0)) {
            return;
        }
        bytes32[] memory s = new bytes32[](1);
        bytes32[] memory p = new bytes32[](1);
        bytes32[] memory o = new bytes32[](1);
        s[0] = jobAtom;
        p[0] = hasSubmissionPredicate;
        o[0] = submissionAtom;
        _createTriplesStrict(s, p, o, valueToForward, "Job->Submission triple creation failed");
    }

    function _createPaymentTripleStrict(bytes32 submissionAtom, bytes32 paymentAtom, uint256 valueToForward) internal {
        // If predicates or atoms are not set, skip triple creation (contract logic still works)
        if (paidOutAsPredicate == bytes32(0) || submissionAtom == bytes32(0) || paymentAtom == bytes32(0)) {
            return;
        }
        bytes32[] memory s = new bytes32[](1);
        bytes32[] memory p = new bytes32[](1);
        bytes32[] memory o = new bytes32[](1);
        s[0] = submissionAtom;
        p[0] = paidOutAsPredicate;
        o[0] = paymentAtom;
        _createTriplesStrict(s, p, o, valueToForward, "Submission->Payment triple creation failed");
    }

    // ---------- Helpers ----------

    // Refund surplus ETH if any; if refund fails, credit pendingWithdrawals
    function _safeRefundOrCredit(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (ok) {
            emit SurplusRefunded(to, amount);
        } else {
            pendingWithdrawals[to] += amount;
            totalPendingWithdrawals += amount; // Fix: Update accounting when crediting
            emit SurplusCredited(to, amount);
        }
    }

    // small format helpers
    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) { len++; j /= 10; }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (v != 0) {
            k = k - 1;
            bstr[k] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(bstr);
    }

    function _a(address addr) internal pure returns (string memory) {
        bytes20 a = bytes20(addr);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint i = 0; i < 20; i++) {
            str[2 + i*2] = hexChars[uint8(a[i] >> 4)];
            str[3 + i*2] = hexChars[uint8(a[i] & 0x0f)];
        }
        return string(str);
    }

    function _b(bytes32 d) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint i = 0; i < 32; i++) {
            str[i*2] = hexChars[uint8(uint8(d[i]) >> 4)];
            str[i*2 + 1] = hexChars[uint8(uint8(d[i]) & 0x0f)];
        }
        return string(str);
    }

    // allow receive funds (owner deposits or extras)
    receive() external payable {}
}


