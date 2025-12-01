// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SecureJobPool is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable TRUST;

    uint256 public constant FEE_BASIS = 10000;
    uint256 public constant MIN_DESCRIPTION_LENGTH = 20;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 500;
    uint256 public constant MIN_DEADLINE_FUTURE = 1 hours;
    uint256 public constant GRACE_PERIOD = 10 minutes; // Buffer for approvals near deadline

    uint16 public platformFeeBps; // Current platform fee (for new jobs)
    address public treasury;
    uint256 public jobCounter;

    // Configurable policies
    bool public allowMultipleSubmissions = true;
    uint256 public maxSubmissionsPerJob = 100;
    uint256 public maxSubmissionsPerUserPerJob = 5;
    uint256 public minJobBudget = 1000; // Minimum to prevent spam

    // Events
    event JobCreated(
        uint256 indexed jobId,
        address indexed creator,
        uint256 budget,
        uint256 deadline,
        uint16 feeBps
    );

    event SubmissionCreated(
        uint256 indexed jobId,
        uint256 indexed submissionId,
        address indexed worker
    );

    event SubmissionApproved(
        uint256 indexed jobId,
        uint256 indexed submissionId,
        address indexed worker,
        uint256 workerAmount,
        uint256 feeAmount
    );

    event JobRefunded(uint256 indexed jobId, uint256 amount);
    event JobCancelled(uint256 indexed jobId, uint256 amount);
    event PlatformFeeUpdated(uint16 newFeeBps);
    event TreasuryUpdated(address newTreasury);
    event PolicyUpdated(string policy, uint256 value);

    event EmergencyRecovery(
        uint256 indexed jobId,
        address indexed recipient,
        uint256 amount
    );

    // Structures
    enum JobStatus {
        Open,
        Approved,
        Refunded,
        Cancelled
    }

    struct Submission {
        address worker;
        bool chosen;
        string previewCID;
        string finalCID;
    }

    struct Job {
        address creator;
        uint256 budget; // Escrowed amount
        uint256 deadline; // Unix timestamp
        uint16 feeBps; // Fee rate locked at job creation
        JobStatus status;
        string description;
        Submission[] submissions;
    }

    mapping(uint256 => Job) private jobs;
    mapping(uint256 => mapping(address => uint256)) public userSubmissionCount;

    // Constructor
    constructor(
        IERC20 _trust,
        address _treasury,
        uint16 _platformFeeBps
    ) {
        require(address(_trust) != address(0), "Invalid TRUST token");
        require(_treasury != address(0), "Invalid treasury");
        require(_platformFeeBps <= 1000, "Fee must be <= 10%");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        TRUST = _trust;
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ========================================
    // ADMIN FUNCTIONS
    // ========================================

    function setPlatformFee(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 1000, "Fee must be <= 10%");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setAllowMultipleSubmissions(bool allow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowMultipleSubmissions = allow;
        emit PolicyUpdated("allowMultipleSubmissions", allow ? 1 : 0);
    }

    function setMaxSubmissionsPerJob(uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(max > 0 && max <= 1000, "Invalid max");
        maxSubmissionsPerJob = max;
        emit PolicyUpdated("maxSubmissionsPerJob", max);
    }

    function setMaxSubmissionsPerUserPerJob(uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(max > 0 && max <= 50, "Invalid max");
        maxSubmissionsPerUserPerJob = max;
        emit PolicyUpdated("maxSubmissionsPerUserPerJob", max);
    }

    function setMinJobBudget(uint256 min) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minJobBudget = min;
        emit PolicyUpdated("minJobBudget", min);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ========================================
    // JOB CREATION
    // ========================================

    function createJob(
        uint256 budget,
        uint256 deadline,
        string calldata description
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(budget >= minJobBudget, "Budget too low");
        require(deadline > block.timestamp + MIN_DEADLINE_FUTURE, "Deadline too soon");

        bytes memory descBytes = bytes(description);
        require(descBytes.length >= MIN_DESCRIPTION_LENGTH, "Description too short");
        require(descBytes.length <= MAX_DESCRIPTION_LENGTH, "Description too long");

        // Escrow funds
        TRUST.safeTransferFrom(msg.sender, address(this), budget);

        // Create job
        jobCounter++;
        uint256 jobId = jobCounter;

        Job storage job = jobs[jobId];
        job.creator = msg.sender;
        job.budget = budget;
        job.deadline = deadline;
        job.feeBps = platformFeeBps;
        job.status = JobStatus.Open;
        job.description = description;

        emit JobCreated(jobId, msg.sender, budget, deadline, platformFeeBps);
        return jobId;
    }

    // ========================================
    // SUBMIT WORK
    // ========================================

    function submitWork(uint256 jobId, string calldata previewCID)
        external
        whenNotPaused
        nonReentrant
    {
        Job storage job = jobs[jobId];

        require(_jobExists(jobId), "Job does not exist");
        require(job.status == JobStatus.Open, "Job not open");
        require(block.timestamp <= job.deadline, "Deadline passed");
        require(_isValidCID(previewCID), "Invalid CID format");

        require(job.submissions.length < maxSubmissionsPerJob, "Job submissions full");

        uint256 userSubmissions = userSubmissionCount[jobId][msg.sender];
        if (!allowMultipleSubmissions) {
            require(userSubmissions == 0, "Only one submission allowed");
        } else {
            require(userSubmissions < maxSubmissionsPerUserPerJob, "User submission limit reached");
        }

        job.submissions.push(
            Submission({
                worker: msg.sender,
                chosen: false,
                previewCID: previewCID,
                finalCID: ""
            })
        );
        userSubmissionCount[jobId][msg.sender]++;

        uint256 submissionId = job.submissions.length - 1;
        emit SubmissionCreated(jobId, submissionId, msg.sender);
    }

    // ========================================
    // APPROVE SUBMISSION
    // ========================================

    function approveSubmission(
        uint256 jobId,
        uint256 submissionId,
        string calldata finalCID
    ) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];

        require(_jobExists(jobId), "Job does not exist");
        require(msg.sender == job.creator, "Only creator can approve");
        require(job.status == JobStatus.Open, "Job not open");

        require(block.timestamp <= job.deadline + GRACE_PERIOD, "Deadline expired");
        require(submissionId < job.submissions.length, "Invalid submission");

        Submission storage submission = job.submissions[submissionId];
        require(!submission.chosen, "Already chosen");
        require(submission.worker != address(0), "Invalid worker");

        require(_isValidCID(finalCID), "Invalid final CID");
        require(
            keccak256(bytes(finalCID)) != keccak256(bytes(submission.previewCID)),
            "Final CID must differ from preview"
        );

        // Effects
        job.status = JobStatus.Approved;
        submission.chosen = true;
        submission.finalCID = finalCID;

        uint256 budget = job.budget;
        uint256 feeAmount = (budget * job.feeBps) / FEE_BASIS;
        uint256 workerAmount = budget - feeAmount;

        job.budget = 0;

        // Interactions
        if (workerAmount > 0) {
            TRUST.safeTransfer(submission.worker, workerAmount);
        }
        if (feeAmount > 0) {
            TRUST.safeTransfer(treasury, feeAmount);
        }

        emit SubmissionApproved(jobId, submissionId, submission.worker, workerAmount, feeAmount);
    }

    // ========================================
    // REFUND EXPIRED JOB
    // ========================================

    function refundIfExpired(uint256 jobId) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];

        require(_jobExists(jobId), "Job does not exist");
        require(msg.sender == job.creator, "Only creator can refund");
        require(job.status == JobStatus.Open, "Job not refundable");
        require(block.timestamp > job.deadline + GRACE_PERIOD, "Grace period not ended");

        job.status = JobStatus.Refunded;
        uint256 refundAmount = job.budget;
        job.budget = 0;

        if (refundAmount > 0) {
            TRUST.safeTransfer(job.creator, refundAmount);
        }

        emit JobRefunded(jobId, refundAmount);
    }

    // ========================================
    // CANCEL JOB (Before submissions)
    // ========================================

    function cancelJob(uint256 jobId) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];

        require(_jobExists(jobId), "Job does not exist");
        require(msg.sender == job.creator, "Only creator can cancel");
        require(job.status == JobStatus.Open, "Job not cancellable");
        require(job.submissions.length == 0, "Cannot cancel with submissions");

        job.status = JobStatus.Cancelled;
        uint256 refundAmount = job.budget;
        job.budget = 0;

        if (refundAmount > 0) {
            TRUST.safeTransfer(job.creator, refundAmount);
        }

        emit JobCancelled(jobId, refundAmount);
    }

    // ========================================
    // EMERGENCY RECOVERY
    // ========================================

    /**
     * @dev Emergency function to recover funds from truly stuck jobs
     * Requirements:
     * - Job must be approved or refunded with remaining budget
     * - Must wait 30 days after job status change
     * - Only admin can execute
     */
    function emergencyRecoverJob(uint256 jobId, address recipient)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        Job storage job = jobs[jobId];

        require(_jobExists(jobId), "Job does not exist");
        require(recipient != address(0), "Invalid recipient");
        require(
            job.status == JobStatus.Approved || job.status == JobStatus.Refunded,
            "Job must be closed"
        );
        require(job.budget > 0, "No funds to recover");
        require(block.timestamp > job.deadline + 30 days, "Must wait 30 days after deadline");

        uint256 amount = job.budget;
        job.budget = 0;

        TRUST.safeTransfer(recipient, amount);
        emit EmergencyRecovery(jobId, recipient, amount);
    }

    /**
     * @dev Recover accidentally sent non-TRUST tokens
     */
    function recoverERC20(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(address(token) != address(TRUST), "Cannot recover TRUST");
        token.safeTransfer(recipient, amount);
    }

    // ========================================
    // VIEW FUNCTIONS
    // ========================================

    function getJob(uint256 jobId)
        external
        view
        returns (
            address creator,
            uint256 budget,
            uint256 deadline,
            uint16 feeBps,
            JobStatus status,
            string memory description,
            uint256 submissionCount
        )
    {
        Job storage job = jobs[jobId];
        return (
            job.creator,
            job.budget,
            job.deadline,
            job.feeBps,
            job.status,
            job.description,
            job.submissions.length
        );
    }

    function getSubmissionCount(uint256 jobId) external view returns (uint256) {
        return jobs[jobId].submissions.length;
    }

    function getSubmission(uint256 jobId, uint256 index)
        external
        view
        returns (
            address worker,
            bool chosen,
            string memory previewCID,
            string memory finalCID
        )
    {
        require(_jobExists(jobId), "Job does not exist");
        require(index < jobs[jobId].submissions.length, "Index out of bounds");

        Submission storage sub = jobs[jobId].submissions[index];
        return (sub.worker, sub.chosen, sub.previewCID, sub.finalCID);
    }

    function getSubmissions(
        uint256 jobId,
        uint256 start,
        uint256 count
    )
        external
        view
        returns (
            address[] memory workers,
            bool[] memory chosen,
            string[] memory previewCIDs
        )
    {
        require(_jobExists(jobId), "Job does not exist");

        Submission[] storage subs = jobs[jobId].submissions;
        uint256 total = subs.length;
        require(start < total, "Start index out of bounds");

        uint256 end = start + count;
        if (end > total) {
            end = total;
        }

        uint256 resultCount = end - start;
        workers = new address[](resultCount);
        chosen = new bool[](resultCount);
        previewCIDs = new string[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            Submission storage sub = subs[start + i];
            workers[i] = sub.worker;
            chosen[i] = sub.chosen;
            previewCIDs[i] = sub.previewCID;
        }
    }

    // ========================================
    // INTERNAL HELPERS
    // ========================================

    function _jobExists(uint256 jobId) private view returns (bool) {
        return jobId > 0 && jobId <= jobCounter && jobs[jobId].creator != address(0);
    }

    /**
     * @dev Validate IPFS CID format
     * Supports CIDv0 (46 chars, starts with "Qm") and CIDv1 (variable length, starts with "b")
     */
    function _isValidCID(string memory cid) private pure returns (bool) {
        bytes memory b = bytes(cid);
        uint256 len = b.length;

        if (len < 46) return false;

        // CIDv0: exactly 46 characters, starts with "Qm"
        if (len == 46) {
            return b[0] == "Q" && b[1] == "m";
        }

        // CIDv1: starts with "baf"
        if (len >= 59 && b[0] == "b" && b[1] == "a" && b[2] == "f") {
            return true;
        }

        return false;
    }

    // ========================================
    // FALLBACK
    // ========================================

    receive() external payable {
        revert("Contract does not accept ETH");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}


