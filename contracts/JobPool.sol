// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title JobPool
 * @dev Escrow contract for freelance work with watermarked submissions
 */
contract JobPool {
    address public platformOwner;
    uint256 public platformFeePercent = 250; // 2.5% (basis points)
    uint256 private constant BASIS_POINTS = 10000;
    
    // Reentrancy guard
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    
    // Emergency pause
    bool public paused;
    
    enum JobStatus { Active, Completed, Cancelled, Expired }
    
    struct Job {
        address creator;
        uint256 payment;
        uint256 deadline;
        JobStatus status;
        bool hasSubmission;
        address worker;
        bytes32 submissionHash; // IPFS hash (more gas efficient than string)
    }
    
    mapping(uint256 => Job) public jobs;
    uint256 public jobCount;
    
    event JobCreated(uint256 indexed jobId, address indexed creator, uint256 payment, uint256 deadline);
    event WorkSubmitted(uint256 indexed jobId, address indexed worker, bytes32 submissionHash);
    event JobCompleted(uint256 indexed jobId, address indexed worker, uint256 workerPayment, uint256 platformFee);
    event JobCancelled(uint256 indexed jobId, address indexed creator, uint256 refund);
    event JobExpired(uint256 indexed jobId, address indexed creator, uint256 refund);
    event Paused(address account);
    event Unpaused(address account);
    
    modifier onlyPlatformOwner() {
        require(msg.sender == platformOwner, "Not platform owner");
        _;
    }
    
    modifier nonReentrant() {
        require(_status != ENTERED, "ReentrancyGuard: reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    modifier whenPaused() {
        require(paused, "Contract is not paused");
        _;
    }
    
    constructor() {
        platformOwner = msg.sender;
        _status = NOT_ENTERED;
        paused = false;
    }
    
    /**
     * @dev Pause contract in emergency
     */
    function pause() external onlyPlatformOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() external onlyPlatformOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }
    
    /**
     * @dev Create a new job pool with locked payment
     * @param _deadline Unix timestamp for job deadline
     */
    function createJob(uint256 _deadline) external payable whenNotPaused returns (uint256) {
        require(msg.value > 0, "Payment must be greater than 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        
        jobCount++;
        jobs[jobCount] = Job({
            creator: msg.sender,
            payment: msg.value,
            deadline: _deadline,
            status: JobStatus.Active,
            hasSubmission: false,
            worker: address(0),
            submissionHash: bytes32(0)
        });
        
        emit JobCreated(jobCount, msg.sender, msg.value, _deadline);
        return jobCount;
    }
    
    /**
     * @dev Worker submits their work (off-chain storage reference)
     * @param _jobId The job ID
     * @param _submissionHash IPFS hash as bytes32 (e.g., base16 CIDv0)
     */
    function submitWork(uint256 _jobId, bytes32 _submissionHash) external whenNotPaused {
        Job storage job = jobs[_jobId];
        require(_jobId > 0 && _jobId <= jobCount, "Invalid job ID");
        require(job.status == JobStatus.Active, "Job not active");
        require(block.timestamp <= job.deadline, "Job deadline passed");
        require(!job.hasSubmission, "Work already submitted");
        require(_submissionHash != bytes32(0), "Invalid submission hash");
        require(msg.sender != job.creator, "Creator cannot submit work");
        
        job.hasSubmission = true;
        job.worker = msg.sender;
        job.submissionHash = _submissionHash;
        
        emit WorkSubmitted(_jobId, msg.sender, _submissionHash);
    }
    
    /**
     * @dev Creator accepts the work and releases payment to worker
     * @param _jobId The job ID
     */
    function acceptWork(uint256 _jobId) external nonReentrant whenNotPaused {
        Job storage job = jobs[_jobId];
        require(msg.sender == job.creator, "Only creator can accept");
        require(job.status == JobStatus.Active, "Job not active");
        require(job.hasSubmission, "No submission to accept");
        
        // Check if deadline passed - if so, automatically expire and refund creator
        if (block.timestamp > job.deadline) {
            uint256 refund = job.payment;
            job.status = JobStatus.Expired;
            
            emit JobExpired(_jobId, job.creator, refund);
            
            (bool success, ) = payable(job.creator).call{value: refund}("");
            require(success, "Refund failed");
            
            // Return early - no revert, transaction succeeds with refund
            return;
        }
        
        uint256 platformFee = (job.payment * platformFeePercent) / BASIS_POINTS;
        uint256 workerPayment = job.payment - platformFee;
        
        // Update state before transfers (CEI pattern)
        job.status = JobStatus.Completed;
        
        // Transfer payments
        (bool successWorker, ) = payable(job.worker).call{value: workerPayment}("");
        require(successWorker, "Worker payment failed");
        
        (bool successPlatform, ) = payable(platformOwner).call{value: platformFee}("");
        require(successPlatform, "Platform fee transfer failed");
        
        emit JobCompleted(_jobId, job.worker, workerPayment, platformFee);
    }
    
    /**
     * @dev Creator cancels job if no submissions exist
     * @param _jobId The job ID
     */
    function cancelJob(uint256 _jobId) external nonReentrant whenNotPaused {
        Job storage job = jobs[_jobId];
        require(msg.sender == job.creator, "Only creator can cancel");
        require(job.status == JobStatus.Active, "Job not active");
        require(!job.hasSubmission, "Cannot cancel with submissions");
        
        uint256 refund = job.payment;
        
        // Update state before transfer (CEI pattern)
        job.status = JobStatus.Cancelled;
        
        (bool success, ) = payable(job.creator).call{value: refund}("");
        require(success, "Refund failed");
        
        emit JobCancelled(_jobId, job.creator, refund);
    }
    
    /**
     * @dev Trigger automatic expiration for jobs past deadline
     * @param _jobId The job ID
     * @dev Can be called by anyone to clean up expired jobs and return funds
     */
    function expireJob(uint256 _jobId) external nonReentrant whenNotPaused {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job not active");
        require(block.timestamp > job.deadline, "Deadline not passed");
        
        uint256 refund = job.payment;
        
        // Update state before transfer (CEI pattern)
        job.status = JobStatus.Expired;
        
        (bool success, ) = payable(job.creator).call{value: refund}("");
        require(success, "Refund failed");
        
        emit JobExpired(_jobId, job.creator, refund);
    }
    
    /**
     * @dev Emergency withdraw - only when paused, only for platform owner
     * @dev Allows recovery of stuck funds in extreme cases
     */
    function emergencyWithdrawJob(uint256 _jobId) external onlyPlatformOwner whenPaused nonReentrant {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Active, "Job not active");
        
        uint256 refund = job.payment;
        job.status = JobStatus.Cancelled;
        
        (bool success, ) = payable(job.creator).call{value: refund}("");
        require(success, "Emergency withdrawal failed");
        
        emit JobCancelled(_jobId, job.creator, refund);
    }
    
    /**
     * @dev Get job details
     */
    function getJob(uint256 _jobId) external view returns (
        address creator,
        uint256 payment,
        uint256 deadline,
        JobStatus status,
        bool hasSubmission,
        address worker,
        bytes32 submissionHash
    ) {
        Job memory job = jobs[_jobId];
        return (
            job.creator,
            job.payment,
            job.deadline,
            job.status,
            job.hasSubmission,
            job.worker,
            job.submissionHash
        );
    }
    
    /**
     * @dev Check if a job is expired (view function)
     */
    function isJobExpired(uint256 _jobId) external view returns (bool) {
        Job memory job = jobs[_jobId];
        return job.status == JobStatus.Active && block.timestamp > job.deadline;
    }
    
    /**
     * @dev Update platform fee (only owner)
     */
    function updatePlatformFee(uint256 _newFeePercent) external onlyPlatformOwner {
        require(_newFeePercent <= 1000, "Fee too high"); // Max 10%
        platformFeePercent = _newFeePercent;
    }
    
    /**
     * @dev Transfer platform ownership
     */
    function transferOwnership(address newOwner) external onlyPlatformOwner {
        require(newOwner != address(0), "Invalid new owner");
        platformOwner = newOwner;
    }
}