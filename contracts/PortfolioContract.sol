// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PortfolioContract (Fully Security-Hardened Version)
 * @dev Batch portfolio creation contract for Intuition Knowledge Graph
 * @notice Creates profile atoms and triples in a single transaction
 * 
 * SECURITY FIXES APPLIED:
 * - Access control on initializePredicates()
 * - Array length limits to prevent DoS
 * - String length limits to prevent DoS
 * - Reentrancy protection
 * - Input validation (empty strings, JSON format)
 * - Predicate overwrite protection
 * - Pause mechanism
 * - Ownership transfer
 * - Safe withdrawal using call()
 * - Control character rejection
 * - Explicit state initialization
 */

interface IMultiVault {
    function createAtoms(bytes[] calldata data, uint256[] calldata assets) external payable returns (bytes32[] memory);
    function createTriples(bytes32[] calldata subjects, bytes32[] calldata predicates, bytes32[] calldata objects, uint256[] calldata assets) external payable returns (bytes32[] memory);
}

contract PortfolioContract {
    IMultiVault public immutable multivault;
    uint256 public constant ATOM_CREATION_FEE = 0.1 ether;
    
    // Security: Access control
    address public owner;
    
    // Security: Pause mechanism
    bool public paused;
    
    // Security: Reentrancy protection
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    
    // Security: Array length limits to prevent DoS
    uint256 public constant MAX_SKILLS = 100;
    uint256 public constant MAX_TAGS = 50;
    uint256 public constant MAX_SOCIALS = 20;
    uint256 public constant MAX_ACHIEVEMENTS = 50;
    uint256 public constant MAX_PROJECTS = 50;
    uint256 public constant MAX_PREDICATES = 100;
    
    // Security: String length limits to prevent DoS
    uint256 public constant MAX_PROFILE_JSON_LENGTH = 10000; // bytes
    uint256 public constant MAX_PROJECT_JSON_LENGTH = 5000;
    uint256 public constant MAX_SOCIAL_JSON_LENGTH = 1000;
    uint256 public constant MAX_SKILL_LENGTH = 100;
    uint256 public constant MAX_TAG_LENGTH = 50;
    uint256 public constant MAX_ACHIEVEMENT_LENGTH = 500;
    uint256 public constant MAX_PREDICATE_NAME_LENGTH = 50;
    
    // Constants for predicate names (prevents typos)
    string public constant PREDICATE_SKILL = "skill";
    string public constant PREDICATE_TAG = "tag";
    string public constant PREDICATE_SOCIAL = "social";
    string public constant PREDICATE_ACHIEVEMENT = "achievement";
    
    // Storage for predicate atom IDs (created once, reused forever)
    mapping(string => bytes32) public predicateIds; // "skill" => 0x1234...
    
    event AtomCreated(bytes32 indexed atomId, string atomType);
    event TripleCreated(bytes32 indexed tripleId, bytes32 subject, string predicate, string objectPreview);
    event PredicateInitialized(string name, bytes32 predicateId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);
    event Withdrawal(address indexed owner, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier nonReentrant() {
        require(_status != ENTERED, "Reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }
    
    /**
     * @notice Constructor initializes the contract
     * @param _multivault Address of the Intuition MultiVault contract
     */
    constructor(address _multivault) {
        require(_multivault != address(0), "Invalid MultiVault address");
        multivault = IMultiVault(_multivault);
        owner = msg.sender;
        _status = NOT_ENTERED; // Explicit initialization
        paused = false; // Explicit initialization
    }
    
    /**
     * @notice Initialize predicate atoms (call once after deployment)
     * @dev Creates predicate atoms for: skill, tag, social, achievement
     * @param names Array of predicate names: ["skill", "tag", "social", "achievement"]
     * @custom:security Only owner can call, prevents overwrites, validates input lengths
     */
    function initializePredicates(string[] calldata names) external payable onlyOwner whenNotPaused {
        require(names.length > 0, "Empty array");
        require(names.length <= MAX_PREDICATES, "Too many predicates");
        require(msg.value == names.length * ATOM_CREATION_FEE, "Send exact fee");
        
        bytes[] memory predDataArr = new bytes[](names.length);
        uint256[] memory predAssets = new uint256[](names.length);
        
        for (uint256 i = 0; i < names.length; i++) {
            require(bytes(names[i]).length > 0, "Empty predicate name");
            require(bytes(names[i]).length <= MAX_PREDICATE_NAME_LENGTH, "Predicate name too long");
            // SECURITY: Prevent overwriting existing predicates
            require(predicateIds[names[i]] == bytes32(0), "Predicate already initialized");
            predDataArr[i] = abi.encodePacked('{"type":"predicate","name":"', names[i], '"}');
            predAssets[i] = ATOM_CREATION_FEE;
        }
        
        bytes32[] memory predIds = multivault.createAtoms{value: msg.value}(predDataArr, predAssets);
        require(predIds.length == names.length, "Predicate creation count mismatch");
        
        for (uint256 i = 0; i < names.length; i++) {
            // SECURITY: Validate returned IDs are non-zero
            require(predIds[i] != bytes32(0), "Invalid predicate ID");
            predicateIds[names[i]] = predIds[i];
            emit PredicateInitialized(names[i], predIds[i]);
        }
    }
    
    /**
     * @notice Batch create a complete portfolio in one transaction
     * @dev Creates profile atom + value atoms + triples in a single call
     * @param profileJson JSON string with profile data: {"name":"...","bio":"..."}
     * @param skills Array of skill names (e.g., ["Solidity", "React"])
     * @param tags Array of tag names (e.g., ["Developer", "Designer"])
     * @param socials Array of JSON strings: ['{"platform":"github","url":"..."}']
     * @param achievements Array of achievement descriptions
     * @param projects Array of JSON strings: ['{"title":"...","description":"..."}']
     * @return profileId The created profile atom ID
     * @return skillIds Array of skill triple IDs
     * @return tagIds Array of tag triple IDs
     * @return socialIds Array of social triple IDs
     * @return achievementIds Array of achievement triple IDs
     * @return projectIds Array of project atom IDs
     * @custom:security Array length limits, reentrancy protection, input validation, string length limits
     */
    function batchCreatePortfolio(
        string calldata profileJson,
        string[] calldata skills,
        string[] calldata tags,
        string[] calldata socials,
        string[] calldata achievements,
        string[] calldata projects
    ) external payable nonReentrant whenNotPaused returns (
        bytes32 profileId,
        bytes32[] memory skillIds,
        bytes32[] memory tagIds,
        bytes32[] memory socialIds,
        bytes32[] memory achievementIds,
        bytes32[] memory projectIds
    ) {
        // SECURITY: Array length validation to prevent DoS
        require(skills.length <= MAX_SKILLS, "Too many skills");
        require(tags.length <= MAX_TAGS, "Too many tags");
        require(socials.length <= MAX_SOCIALS, "Too many socials");
        require(achievements.length <= MAX_ACHIEVEMENTS, "Too many achievements");
        require(projects.length <= MAX_PROJECTS, "Too many projects");
        
        // SECURITY: String length validation to prevent DoS
        require(bytes(profileJson).length > 0, "Empty profile JSON");
        require(bytes(profileJson).length <= MAX_PROFILE_JSON_LENGTH, "Profile JSON too long");
        
        for (uint256 i = 0; i < projects.length; i++) {
            require(bytes(projects[i]).length > 0, "Empty project JSON");
            require(bytes(projects[i]).length <= MAX_PROJECT_JSON_LENGTH, "Project JSON too long");
        }
        
        for (uint256 i = 0; i < socials.length; i++) {
            require(bytes(socials[i]).length > 0, "Empty social JSON");
            require(bytes(socials[i]).length <= MAX_SOCIAL_JSON_LENGTH, "Social JSON too long");
            // SECURITY: Basic JSON format validation
            bytes memory socialBytes = bytes(socials[i]);
            require(socialBytes.length >= 2, "Invalid social JSON");
            require(socialBytes[0] == '{' && socialBytes[socialBytes.length - 1] == '}', "Invalid JSON format");
        }
        
        // SECURITY: Validate predicates exist
        require(predicateIds[PREDICATE_SKILL] != bytes32(0), "Predicate 'skill' not initialized");
        require(predicateIds[PREDICATE_TAG] != bytes32(0), "Predicate 'tag' not initialized");
        require(predicateIds[PREDICATE_SOCIAL] != bytes32(0), "Predicate 'social' not initialized");
        require(predicateIds[PREDICATE_ACHIEVEMENT] != bytes32(0), "Predicate 'achievement' not initialized");
        
        // Calculate total atoms: 1 profile + N projects + value atoms for skills/tags/socials/achievements
        uint256 totalValueAtoms = skills.length + tags.length + socials.length + achievements.length;
        uint256 totalAtoms = 1 + projects.length + totalValueAtoms; // Profile + Projects + Value atoms
        
        // Calculate total triples: skills + tags + socials + achievements
        uint256 totalTriples = skills.length + tags.length + socials.length + achievements.length;
        
        // Total fee = (atoms × ATOM_CREATION_FEE) + (triples × ATOM_CREATION_FEE)
        // SECURITY: Check for potential overflow (defensive)
        require(totalAtoms + totalTriples <= type(uint256).max / ATOM_CREATION_FEE, "Fee calculation overflow");
        uint256 totalFee = (totalAtoms + totalTriples) * ATOM_CREATION_FEE;
        require(msg.value == totalFee, "Send exact total fee");
        
        // ============================================
        // STEP 1: Create Atoms (Profile + Projects + Value Atoms)
        // ============================================
        
        bytes[] memory atomDataArr = new bytes[](totalAtoms);
        uint256[] memory atomAssets = new uint256[](totalAtoms);
        uint256 atomCounter = 0;
        
        // Profile atom
        atomDataArr[atomCounter] = abi.encodePacked('{"type":"profile","data":', profileJson, '}');
        atomAssets[atomCounter] = ATOM_CREATION_FEE;
        atomCounter++;
        
        // Project atoms
        for (uint256 i = 0; i < projects.length; i++) {
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"project","data":', projects[i], '}');
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        // Value atoms for skills
        bytes32[] memory skillValueIds = new bytes32[](skills.length);
        for (uint256 i = 0; i < skills.length; i++) {
            require(bytes(skills[i]).length > 0, "Empty skill");
            require(bytes(skills[i]).length <= MAX_SKILL_LENGTH, "Skill too long");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":"', _escapeJson(skills[i]), '"}');
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        // Value atoms for tags
        bytes32[] memory tagValueIds = new bytes32[](tags.length);
        for (uint256 i = 0; i < tags.length; i++) {
            require(bytes(tags[i]).length > 0, "Empty tag");
            require(bytes(tags[i]).length <= MAX_TAG_LENGTH, "Tag too long");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":"', _escapeJson(tags[i]), '"}');
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        // Value atoms for socials (socials[i] is already validated JSON)
        bytes32[] memory socialValueIds = new bytes32[](socials.length);
        for (uint256 i = 0; i < socials.length; i++) {
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":', socials[i], '}');
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        // Value atoms for achievements
        bytes32[] memory achievementValueIds = new bytes32[](achievements.length);
        for (uint256 i = 0; i < achievements.length; i++) {
            require(bytes(achievements[i]).length > 0, "Empty achievement");
            require(bytes(achievements[i]).length <= MAX_ACHIEVEMENT_LENGTH, "Achievement too long");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":"', _escapeJson(achievements[i]), '"}');
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        // Execute atom creation
        uint256 atomsFee = totalAtoms * ATOM_CREATION_FEE;
        bytes32[] memory atomIds = multivault.createAtoms{value: atomsFee}(atomDataArr, atomAssets);
        require(atomIds.length == totalAtoms, "Atom creation count mismatch");
        
        // SECURITY: Validate all returned IDs are non-zero
        for (uint256 i = 0; i < atomIds.length; i++) {
            require(atomIds[i] != bytes32(0), "Invalid atom ID");
        }
        
        profileId = atomIds[0];
        emit AtomCreated(profileId, "profile");
        
        // Assign project IDs (skip profileId at index 0)
        projectIds = new bytes32[](projects.length);
        for (uint256 i = 0; i < projects.length; i++) {
            projectIds[i] = atomIds[1 + i];
            emit AtomCreated(projectIds[i], "project");
        }
        
        // Extract value atom IDs with explicit bounds checking
        uint256 valueStartIndex = 1 + projects.length;
        
        // SECURITY: Explicit bounds checking
        require(valueStartIndex + skills.length <= atomIds.length, "Array bounds error: skills");
        for (uint256 i = 0; i < skills.length; i++) {
            skillValueIds[i] = atomIds[valueStartIndex + i];
        }
        valueStartIndex += skills.length;
        
        require(valueStartIndex + tags.length <= atomIds.length, "Array bounds error: tags");
        for (uint256 i = 0; i < tags.length; i++) {
            tagValueIds[i] = atomIds[valueStartIndex + i];
        }
        valueStartIndex += tags.length;
        
        require(valueStartIndex + socials.length <= atomIds.length, "Array bounds error: socials");
        for (uint256 i = 0; i < socials.length; i++) {
            socialValueIds[i] = atomIds[valueStartIndex + i];
        }
        valueStartIndex += socials.length;
        
        require(valueStartIndex + achievements.length <= atomIds.length, "Array bounds error: achievements");
        for (uint256 i = 0; i < achievements.length; i++) {
            achievementValueIds[i] = atomIds[valueStartIndex + i];
        }
        
        // ============================================
        // STEP 2: Create Triples (Skills, Tags, Socials, Achievements)
        // ============================================
        
        if (totalTriples > 0) {
            // Prepare arrays for batch triple creation
            bytes32[] memory tripleSubjects = new bytes32[](totalTriples);
            bytes32[] memory triplePredicates = new bytes32[](totalTriples);
            bytes32[] memory tripleObjects = new bytes32[](totalTriples);
            uint256[] memory tripleAssets = new uint256[](totalTriples);
            uint256 tripleCounter = 0;
            
            // Skill triples: profileId → skillPredicate → skillValue
            for (uint256 i = 0; i < skills.length; i++) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_SKILL];
                tripleObjects[tripleCounter] = skillValueIds[i];
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            // Tag triples
            for (uint256 i = 0; i < tags.length; i++) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_TAG];
                tripleObjects[tripleCounter] = tagValueIds[i];
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            // Social triples
            for (uint256 i = 0; i < socials.length; i++) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_SOCIAL];
                tripleObjects[tripleCounter] = socialValueIds[i];
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            // Achievement triples
            for (uint256 i = 0; i < achievements.length; i++) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_ACHIEVEMENT];
                tripleObjects[tripleCounter] = achievementValueIds[i];
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            // Execute batch triple creation
            uint256 triplesFee = totalTriples * ATOM_CREATION_FEE;
            bytes32[] memory tripleIds = multivault.createTriples{value: triplesFee}(
                tripleSubjects,
                triplePredicates,
                tripleObjects,
                tripleAssets
            );
            require(tripleIds.length == totalTriples, "Triple creation count mismatch");
            
            // SECURITY: Validate all returned triple IDs are non-zero
            for (uint256 i = 0; i < tripleIds.length; i++) {
                require(tripleIds[i] != bytes32(0), "Invalid triple ID");
            }
            
            // Assign triple IDs to return arrays
            tripleCounter = 0;
            skillIds = new bytes32[](skills.length);
            for (uint256 i = 0; i < skills.length; i++) {
                skillIds[i] = tripleIds[tripleCounter++];
                emit TripleCreated(skillIds[i], profileId, "skill", skills[i]);
            }
            
            tagIds = new bytes32[](tags.length);
            for (uint256 i = 0; i < tags.length; i++) {
                tagIds[i] = tripleIds[tripleCounter++];
                emit TripleCreated(tagIds[i], profileId, "tag", tags[i]);
            }
            
            socialIds = new bytes32[](socials.length);
            for (uint256 i = 0; i < socials.length; i++) {
                socialIds[i] = tripleIds[tripleCounter++];
                emit TripleCreated(socialIds[i], profileId, "social", "");
            }
            
            achievementIds = new bytes32[](achievements.length);
            for (uint256 i = 0; i < achievements.length; i++) {
                achievementIds[i] = tripleIds[tripleCounter++];
                emit TripleCreated(achievementIds[i], profileId, "achievement", achievements[i]);
            }
        } else {
            skillIds = new bytes32[](0);
            tagIds = new bytes32[](0);
            socialIds = new bytes32[](0);
            achievementIds = new bytes32[](0);
        }
    }
    
    /**
     * @notice Improved JSON escaping (escapes quotes, backslashes, newlines, tabs, rejects control chars)
     * @dev Escapes common JSON-breaking characters and rejects control characters
     * @param str Input string to escape
     * @return Escaped string safe for JSON
     * @custom:security Rejects control characters to prevent data corruption
     */
    function _escapeJson(string memory str) private pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(strBytes.length * 6); // Worst case: all control chars
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < strBytes.length; i++) {
            bytes1 char = strBytes[i];
            if (char == '"') {
                result[resultIndex++] = '\\';
                result[resultIndex++] = '"';
            } else if (char == '\\') {
                result[resultIndex++] = '\\';
                result[resultIndex++] = '\\';
            } else if (char == '\n') {
                result[resultIndex++] = '\\';
                result[resultIndex++] = 'n';
            } else if (char == '\r') {
                result[resultIndex++] = '\\';
                result[resultIndex++] = 'r';
            } else if (char == '\t') {
                result[resultIndex++] = '\\';
                result[resultIndex++] = 't';
            } else if (char < 0x20) {
                // SECURITY: Reject control characters instead of silently dropping
                // This prevents data corruption and makes failures explicit
                revert("Control characters not allowed");
            } else {
                result[resultIndex++] = char;
            }
        }
        
        // Resize result array to actual length
        bytes memory finalResult = new bytes(resultIndex);
        for (uint256 i = 0; i < resultIndex; i++) {
            finalResult[i] = result[i];
        }
        
        return string(finalResult);
    }
    
    /**
     * @notice Pause the contract (emergency stop)
     * @dev Only owner can pause. Prevents new portfolio creations.
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }
    
    /**
     * @notice Unpause the contract
     * @dev Only owner can unpause. Resumes normal operation.
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }
    
    /**
     * @notice Transfer ownership to a new address
     * @param newOwner Address of the new owner
     * @dev Only current owner can transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    /**
     * @notice Withdraw contract balance to owner
     * @dev Only owner can withdraw. Uses call() for safe transfer to contracts.
     * @custom:security Uses call() instead of transfer() to support contract recipients
     */
    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No balance to withdraw");
        
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Withdraw failed");
        
        emit Withdrawal(owner, amount);
    }
    
    /**
     * @notice Receive function to accept ETH
     * @dev Allows contract to receive ETH directly
     */
    receive() external payable {}
}
