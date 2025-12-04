// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingContract
 * @dev Allows users to vote on jobs created in JobPool.
 * Votes are stored as triples in Intuition MultiVault: userAtom -> votedPredicate -> jobAtom
 * @notice Security-hardened version with reentrancy protection, pause mechanism, and proper error handling
 */

interface IMultiVault {
    function createTriples(
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets
    ) external payable returns (bytes32[] memory);
}

interface IJobPool {
    function jobAtomIds(uint256 jobId) external view returns (bytes32);
    function jobCount() external view returns (uint256);
    // Access job status via public mapping getter
    // Note: Solidity auto-generated getter skips arrays, so submissions[] is not returned
    // JobStatus enum: 0=Active, 1=Completed, 2=Cancelled, 3=Expired
    function jobs(uint256 jobId) external view returns (
        address creator,
        uint256 payment,
        uint256 deadline,
        uint8 status,  // JobStatus enum as uint8
        uint256 activeSubmissionsCount,  // returned (array is skipped)
        uint256 platformFeeAtCreation,  // returned
        string memory jobMetaHash       // returned
    );
}

contract VotingContract {
    IMultiVault public immutable multivault;
    IJobPool public immutable jobPool;

    // Predicate for vote triples
    bytes32 public immutable votedPredicate;

    // Owner for pause/unpause
    address public owner;

    // Pause mechanism
    bool public paused;

    // Reentrancy guard
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    uint256 public constant ATOM_CREATION_FEE = 0.1 ether;

    struct Vote {
        address voter;
        uint256 jobId;
        bytes32 tripleId; // optional: can be tracked via events
    }

    // Mapping jobId => array of votes
    mapping(uint256 => Vote[]) public jobVotes;

    // Mapping voter => jobId => hasVoted
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    // Events
    event VoteCast(uint256 indexed jobId, address indexed voter, bytes32 userAtomId, bytes32 tripleId);
    event Paused(address account);
    event Unpaused(address account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
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

    constructor(address _multivault, address _jobPool, bytes32 _votedPredicate) {
        require(_multivault != address(0) && _jobPool != address(0), "Invalid addresses");
        require(_votedPredicate != bytes32(0), "Predicate required");
        multivault = IMultiVault(_multivault);
        jobPool = IJobPool(_jobPool);
        votedPredicate = _votedPredicate;
        owner = msg.sender;
        _status = NOT_ENTERED;
        paused = false;
    }

    /**
     * @notice Cast a vote on a job
     * @param _jobId Job ID from JobPool
     * @param _userAtomId Atom ID of the voter in MultiVault
     * @dev Follows CEI pattern: Checks -> Effects -> Interactions
     * @dev Protected by nonReentrant and whenNotPaused modifiers
     */
    function voteOnJob(uint256 _jobId, bytes32 _userAtomId) external payable whenNotPaused nonReentrant {
        // CHECKS
        require(_jobId > 0 && _jobId <= jobPool.jobCount(), "Invalid job ID");
        require(_userAtomId != bytes32(0), "Invalid user atom");
        require(msg.value == ATOM_CREATION_FEE, "Send exact atom creation fee");
        require(!hasVoted[msg.sender][_jobId], "Already voted");

        // Get the job's atomId from JobPool
        bytes32 jobAtomId = jobPool.jobAtomIds(_jobId);
        require(jobAtomId != bytes32(0), "Job atom not found");

        // Validate job status: only Active jobs can be voted on
        // JobStatus enum: 0=Active, 1=Completed, 2=Cancelled, 3=Expired
        (,,, uint8 jobStatus,,,) = jobPool.jobs(_jobId);
        require(jobStatus == 0, "Job not active"); // 0 = Active (only active jobs can be voted)

        // EFFECTS: Update state BEFORE external call (CEI pattern)
        hasVoted[msg.sender][_jobId] = true;
        
        // Prepare triple data
        bytes32[] memory subjects = new bytes32[](1);
        bytes32[] memory predicates = new bytes32[](1);
        bytes32[] memory objects = new bytes32[](1);
        uint256[] memory assets = new uint256[](1);

        subjects[0] = _userAtomId;
        predicates[0] = votedPredicate;
        objects[0] = jobAtomId;
        assets[0] = msg.value;

        // INTERACTIONS: External call with error handling
        bytes32 tripleId;
        try multivault.createTriples{value: msg.value}(subjects, predicates, objects, assets) returns (bytes32[] memory tripleIds) {
            require(tripleIds.length > 0 && tripleIds[0] != bytes32(0), "Triple creation failed: invalid ID");
            tripleId = tripleIds[0];
        } catch Error(string memory reason) {
            // Revert state change on failure
            hasVoted[msg.sender][_jobId] = false;
            revert(string(abi.encodePacked("Vote failed: ", reason)));
        } catch {
            // Revert state change on failure
            hasVoted[msg.sender][_jobId] = false;
            revert("Vote failed: createTriples failed");
        }

        // Track vote locally (after successful triple creation)
        jobVotes[_jobId].push(Vote({
            voter: msg.sender,
            jobId: _jobId,
            tripleId: tripleId
        }));

        emit VoteCast(_jobId, msg.sender, _userAtomId, tripleId);
    }

    /**
     * @notice Get the number of votes for a job
     */
    function getVotesCount(uint256 _jobId) external view returns (uint256) {
        return jobVotes[_jobId].length;
    }

    /**
     * @notice Get all votes for a job
     */
    function getVotes(uint256 _jobId) external view returns (Vote[] memory) {
        return jobVotes[_jobId];
    }

    /**
     * @notice Check if a user has voted on a job
     */
    function checkHasVoted(address _voter, uint256 _jobId) external view returns (bool) {
        return hasVoted[_voter][_jobId];
    }

    // ---------- Owner Functions ----------

    /**
     * @notice Pause voting functionality (emergency stop)
     */
    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause voting functionality
     */
    function unpause() external onlyOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Transfer ownership to a new address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        require(newOwner != owner, "Already owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // Allow contract to receive ETH (if needed)
    receive() external payable {}
}

