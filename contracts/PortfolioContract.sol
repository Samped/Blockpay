// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PortfolioContract (Fully Security-Hardened Version)
 * @dev Batch portfolio creation contract for Intuition Knowledge Graph
 * @notice Creates profile atoms and triples in a single transaction
 */

interface IMultiVault {
    function createAtoms(bytes[] calldata data, uint256[] calldata assets) external payable returns (bytes32[] memory);
    function createTriples(bytes32[] calldata subjects, bytes32[] calldata predicates, bytes32[] calldata objects, uint256[] calldata assets) external payable returns (bytes32[] memory);
}

contract PortfolioContract {
    IMultiVault public immutable multivault;
    uint256 public constant ATOM_CREATION_FEE = 0.1 ether; // 0.1 TRUST
    uint256 public constant PLATFORM_FEE = 0.1 ether; // 0.1 TRUST
    
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
    uint256 public constant MAX_PROFILE_JSON_LENGTH = 50000; // bytes, allow longer bios
    uint256 public constant MAX_PROJECT_JSON_LENGTH = 5000;
    uint256 public constant MAX_SOCIAL_JSON_LENGTH = 1000;
    uint256 public constant MAX_SKILL_LENGTH = 100;
    uint256 public constant MAX_TAG_LENGTH = 50;
    uint256 public constant MAX_ACHIEVEMENT_LENGTH = 500;
    uint256 public constant MAX_PREDICATE_NAME_LENGTH = 50;
    uint256 public constant MAX_IMAGES = 200;
    uint256 public constant MAX_IMAGE_HASH_LENGTH = 200;
    uint256 public constant MAX_COMBINED_ARRAY_LENGTH = 500;
    uint256 public constant MAX_TRUST_NOTE_LENGTH = 500;
    
    // Constants for predicate names (prevents typos)
    string public constant PREDICATE_SKILL = "skill";
    string public constant PREDICATE_TAG = "tag";
    string public constant PREDICATE_SOCIAL = "social";
    string public constant PREDICATE_ACHIEVEMENT = "achievement";
    string public constant PREDICATE_IMAGE = "image";
    string public constant PREDICATE_PROJECT = "project";
    string public constant PREDICATE_TRUSTED_BY = "trustedBy";
    
    // Storage for predicate atom IDs (created once, reused forever)
    mapping(string => bytes32) public predicateIds; // "skill" => 0x1234...
    mapping(bytes32 => mapping(address => bool)) private profileTrustedBy;
    
    event AtomCreated(bytes32 indexed atomId, string atomType);
    event TripleCreated(bytes32 indexed tripleId, bytes32 subject, string predicate, string objectPreview);
    event PredicateInitialized(string name, bytes32 predicateId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);
    event Withdrawal(address indexed owner, uint256 amount);
    event ImageHashesStored(bytes32 indexed profileId, bytes32 imageAtomId, uint256 count);
    event TrustedByAdded(bytes32 indexed profileId, address indexed voter, bytes32 trustAtomId, bytes32 trustTripleId);
    
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
     * @notice Set predicate IDs manually (use if predicates already exist in MultiVault)
     * @dev Allows owner to set predicate IDs without creating new atoms
     * @param names Array of predicate names
     * @param ids Array of corresponding predicate atom IDs
     * @custom:security Only owner can call, prevents overwrites
     */
    function setPredicateIds(string[] calldata names, bytes32[] calldata ids) external onlyOwner {
        require(names.length == ids.length, "Arrays length mismatch");
        require(names.length > 0, "Empty array");
        
        for (uint256 i = 0; i < names.length; i++) {
            require(bytes(names[i]).length > 0, "Empty predicate name");
            require(ids[i] != bytes32(0), "Invalid predicate ID");
            // SECURITY: Prevent overwriting existing predicates
            require(predicateIds[names[i]] == bytes32(0), "Predicate already set");
            predicateIds[names[i]] = ids[i];
            emit PredicateInitialized(names[i], ids[i]);
        }
    }
    
    /**
     * @notice Set a single predicate ID (easier to use in Remix)
     * @dev Allows owner to set one predicate ID at a time
     * @param name Predicate name
     * @param id Predicate atom ID
     * @custom:security Only owner can call, prevents overwrites
     */
    function setPredicateId(string calldata name, bytes32 id) external onlyOwner {
        require(bytes(name).length > 0, "Empty predicate name");
        require(id != bytes32(0), "Invalid predicate ID");
        // SECURITY: Prevent overwriting existing predicates
        require(predicateIds[name] == bytes32(0), "Predicate already set");
        predicateIds[name] = id;
        emit PredicateInitialized(name, id);
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
        require(predicateIds[PREDICATE_PROJECT] != bytes32(0), "Predicate 'project' not initialized");
        require(predicateIds[PREDICATE_TRUSTED_BY] != bytes32(0), "Predicate 'trustedBy' not initialized");
        
        // Calculate total atoms: 1 profile + up to 5 category atoms (skills, tags, socials, achievements, projects)
        uint256 totalValueAtoms = 0;
        if (skills.length > 0) totalValueAtoms += 1;
        if (tags.length > 0) totalValueAtoms += 1;
        if (socials.length > 0) totalValueAtoms += 1;
        if (achievements.length > 0) totalValueAtoms += 1;
        if (projects.length > 0) totalValueAtoms += 1;
        uint256 totalAtoms = 1 + totalValueAtoms; // Profile + category atoms
        
        // Calculate total triples: one per non-empty category (skills, tags, socials, achievements, projects)
        uint256 totalTriples = totalValueAtoms;
        
        // Total fee = (atoms x ATOM_CREATION_FEE) + (triples x ATOM_CREATION_FEE) + platform fee
        // SECURITY: Check for potential overflow (defensive)
        require(totalAtoms + totalTriples <= type(uint256).max / ATOM_CREATION_FEE, "Fee calculation overflow");
        uint256 totalFee = (totalAtoms + totalTriples) * ATOM_CREATION_FEE;
        uint256 requiredValue = totalFee + PLATFORM_FEE;
        require(msg.value == requiredValue, "Send exact total fee");
        
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
        
        // Single value atom per category (arrays)
        bytes32 skillValueId = bytes32(0);
        bytes32 tagValueId = bytes32(0);
        bytes32 socialValueId = bytes32(0);
        bytes32 achievementValueId = bytes32(0);
        bytes32 projectValueId = bytes32(0);
        
        if (skills.length > 0) {
            bytes memory skillsJson = _buildStringArrayJson(skills, MAX_SKILL_LENGTH, "skill");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":{"type":"skills","values":', skillsJson, "}}");
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        if (tags.length > 0) {
            bytes memory tagsJson = _buildStringArrayJson(tags, MAX_TAG_LENGTH, "tag");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":{"type":"tags","values":', tagsJson, "}}");
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        if (socials.length > 0) {
            bytes memory socialsJson = _buildJsonArray(socials, MAX_SOCIAL_JSON_LENGTH, true, "social");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":{"type":"socials","values":', socialsJson, "}}");
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        if (achievements.length > 0) {
            bytes memory achievementsJson = _buildStringArrayJson(achievements, MAX_ACHIEVEMENT_LENGTH, "achievement");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":{"type":"achievements","values":', achievementsJson, "}}");
            atomAssets[atomCounter] = ATOM_CREATION_FEE;
            atomCounter++;
        }
        
        if (projects.length > 0) {
            bytes memory projectsJson = _buildJsonArray(projects, MAX_PROJECT_JSON_LENGTH, false, "project");
            atomDataArr[atomCounter] = abi.encodePacked('{"type":"value","data":{"type":"projects","values":', projectsJson, "}}");
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
        
        uint256 valueIndex = 1;
        if (skills.length > 0) {
            skillValueId = atomIds[valueIndex++];
            emit AtomCreated(skillValueId, "skills");
        }
        if (tags.length > 0) {
            tagValueId = atomIds[valueIndex++];
            emit AtomCreated(tagValueId, "tags");
        }
        if (socials.length > 0) {
            socialValueId = atomIds[valueIndex++];
            emit AtomCreated(socialValueId, "socials");
        }
        if (achievements.length > 0) {
            achievementValueId = atomIds[valueIndex++];
            emit AtomCreated(achievementValueId, "achievements");
        }
        if (projects.length > 0) {
            projectValueId = atomIds[valueIndex++];
            emit AtomCreated(projectValueId, "projects");
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
            
            if (skills.length > 0) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_SKILL];
                tripleObjects[tripleCounter] = skillValueId;
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            if (tags.length > 0) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_TAG];
                tripleObjects[tripleCounter] = tagValueId;
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            if (socials.length > 0) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_SOCIAL];
                tripleObjects[tripleCounter] = socialValueId;
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            if (achievements.length > 0) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_ACHIEVEMENT];
                tripleObjects[tripleCounter] = achievementValueId;
                tripleAssets[tripleCounter] = ATOM_CREATION_FEE;
                tripleCounter++;
            }
            
            if (projects.length > 0) {
                tripleSubjects[tripleCounter] = profileId;
                triplePredicates[tripleCounter] = predicateIds[PREDICATE_PROJECT];
                tripleObjects[tripleCounter] = projectValueId;
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
            skillIds = skills.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (skills.length > 0) {
                skillIds[0] = tripleIds[0];
                emit TripleCreated(skillIds[0], profileId, "skill", skills.length > 0 ? skills[0] : "");
            }
            
            tagIds = tags.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (tags.length > 0) {
                tagIds[0] = tripleIds[skillIds.length];
                emit TripleCreated(tagIds[0], profileId, "tag", tags.length > 0 ? tags[0] : "");
            }
            
            socialIds = socials.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (socials.length > 0) {
                socialIds[0] = tripleIds[skillIds.length + tagIds.length];
                emit TripleCreated(socialIds[0], profileId, "social", "");
            }
            
            achievementIds = achievements.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (achievements.length > 0) {
                achievementIds[0] = tripleIds[skillIds.length + tagIds.length + socialIds.length];
                emit TripleCreated(achievementIds[0], profileId, "achievement", achievements.length > 0 ? achievements[0] : "");
            }
            
            projectIds = projects.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (projects.length > 0) {
                projectIds[0] = tripleIds[skillIds.length + tagIds.length + socialIds.length + achievementIds.length];
                emit TripleCreated(projectIds[0], profileId, "project", "");
            }
        } else {
            skillIds = new bytes32[](0);
            tagIds = new bytes32[](0);
            socialIds = new bytes32[](0);
            achievementIds = new bytes32[](0);
            projectIds = new bytes32[](0);
        }
    }
    
    /**
     * @notice Store multiple image hashes (CID / IPFS / Arweave / DataVass) for a profile
     * @dev Creates a single value atom that contains an array of hashes and links it to the profile with one triple.
     *      Only one atom creation fee is charged; the triple is created with zero asset cost.
     * @param profileId The profile atom ID to link the images to
     * @param imageHashes Array of image hashes to store
     * @return imageAtomId The created value atom containing the hashes
     * @return tripleId The triple ID linking the profile to the image atom
     */
    function addProfileImages(bytes32 profileId, string[] calldata imageHashes)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 imageAtomId, bytes32 tripleId)
    {
        require(profileId != bytes32(0), "Invalid profileId");
        require(predicateIds[PREDICATE_IMAGE] != bytes32(0), "Predicate 'image' not initialized");
        require(imageHashes.length > 0, "Empty image list");
        require(imageHashes.length <= MAX_IMAGES, "Too many images");
        require(msg.value == ATOM_CREATION_FEE, "Send exact atom fee");
        
        for (uint256 i = 0; i < imageHashes.length; i++) {
            require(bytes(imageHashes[i]).length > 0, "Empty image hash");
            require(bytes(imageHashes[i]).length <= MAX_IMAGE_HASH_LENGTH, "Image hash too long");
            _escapeJson(imageHashes[i]); // Reverts on control characters
        }
        
        bytes memory hashesJson = _buildHashesJson(imageHashes);
        bytes memory atomData = abi.encodePacked(
            '{"type":"value","data":{"type":"image_list","hashes":',
            hashesJson,
            "}}"
        );
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        require(atomIds.length == 1 && atomIds[0] != bytes32(0), "Invalid image atom ID");
        
        imageAtomId = atomIds[0];
        emit AtomCreated(imageAtomId, "image_list");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_IMAGE];
        tripleObjects[0] = imageAtomId;
        tripleAssets[0] = 0;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: 0}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        require(tripleIds.length == 1 && tripleIds[0] != bytes32(0), "Invalid image triple ID");
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, "image", string(hashesJson));
        emit ImageHashesStored(profileId, imageAtomId, imageHashes.length);
    }

    /**
     * @notice Allow users to signal trust for a portfolio
     * @dev Creates one value atom containing voter metadata and links it with one triple.
     *      Charges exactly two atom fees (one for the atom, one for the triple asset).
     * @param profileId Portfolio profile atom to trust
     * @return trustAtomId The created value atom
     * @return trustTripleId The triple linking voter trust to the profile
     */
    function trustPortfolio(bytes32 profileId)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 trustAtomId, bytes32 trustTripleId)
    {
        require(profileId != bytes32(0), "Invalid profileId");
        require(predicateIds[PREDICATE_TRUSTED_BY] != bytes32(0), "Predicate 'trustedBy' not initialized");
        require(!profileTrustedBy[profileId][msg.sender], "Already trusted");
        require(msg.value == ATOM_CREATION_FEE * 2, "Send exact trust fee");

        string memory voterHex = _addressToHex(msg.sender);
        string memory ts = _uintToString(block.timestamp);

        bytes memory atomData = abi.encodePacked(
            '{"type":"value","data":{"type":"trusted_by","voter":"',
            voterHex,
            '","timestamp":',
            ts,
            "}}"
        );

        bytes[] memory atomDataArr = new bytes[](1);
        uint256[] memory atomAssets = new uint256[](1);
        atomDataArr[0] = atomData;
        atomAssets[0] = ATOM_CREATION_FEE;

        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        require(atomIds.length == 1 && atomIds[0] != bytes32(0), "Invalid trust atom ID");

        trustAtomId = atomIds[0];
        emit AtomCreated(trustAtomId, "trusted_by");

        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);

        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_TRUSTED_BY];
        tripleObjects[0] = trustAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;

        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        require(tripleIds.length == 1 && tripleIds[0] != bytes32(0), "Invalid trust triple ID");

        trustTripleId = tripleIds[0];
        emit TripleCreated(trustTripleId, profileId, "trustedBy", voterHex);
        emit TrustedByAdded(profileId, msg.sender, trustAtomId, trustTripleId);
        profileTrustedBy[profileId][msg.sender] = true;
    }
    
    /**
     * @notice Build JSON array of image hashes
     * @param hashes Array of hashes
     * @return jsonBytes Encoded JSON array as bytes
     */
    function _buildHashesJson(string[] calldata hashes) private pure returns (bytes memory jsonBytes) {
        bytes memory result = "[";
        for (uint256 i = 0; i < hashes.length; i++) {
            result = abi.encodePacked(result, '"', _escapeJson(hashes[i]), '"');
            if (i + 1 < hashes.length) {
                result = abi.encodePacked(result, ",");
            }
        }
        result = abi.encodePacked(result, "]");
        return result;
    }
    
    /**
     * @notice Build JSON array of strings with validation
     */
    function _buildStringArrayJson(string[] calldata values, uint256 maxLen, string memory /* field */) private pure returns (bytes memory) {
        require(values.length <= MAX_COMBINED_ARRAY_LENGTH, "Too many values");
        bytes memory result = "[";
        for (uint256 i = 0; i < values.length; i++) {
            require(bytes(values[i]).length > 0, "Empty value");
            require(bytes(values[i]).length <= maxLen, "Value too long");
            result = abi.encodePacked(result, '"', _escapeJson(values[i]), '"');
            if (i + 1 < values.length) {
                result = abi.encodePacked(result, ",");
            }
        }
        result = abi.encodePacked(result, "]");
        return result;
    }
    
    /**
     * @notice Build JSON array of JSON strings with validation
     */
    function _buildJsonArray(string[] calldata values, uint256 maxLen, bool validateBraces, string memory /* field */) private pure returns (bytes memory) {
        require(values.length <= MAX_COMBINED_ARRAY_LENGTH, "Too many values");
        bytes memory result = "[";
        for (uint256 i = 0; i < values.length; i++) {
            require(bytes(values[i]).length > 0, "Empty value");
            require(bytes(values[i]).length <= maxLen, "Value too long");
            if (validateBraces) {
                bytes memory v = bytes(values[i]);
                require(v.length >= 2 && v[0] == '{' && v[v.length - 1] == '}', "Invalid JSON format");
            }
            result = abi.encodePacked(result, values[i]);
            if (i + 1 < values.length) {
                result = abi.encodePacked(result, ",");
            }
        }
        result = abi.encodePacked(result, "]");
        return result;
    }

    /**
     * @notice Convert address to lowercase hex string
     */
    function _addressToHex(address account) private pure returns (string memory) {
        bytes20 value = bytes20(account);
        bytes16 hexSymbols = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexSymbols[uint8(value[i] >> 4)];
            str[3 + i * 2] = hexSymbols[uint8(value[i] & 0x0f)];
        }
        return string(str);
    }

    /**
     * @notice Convert uint to decimal string
     */
    function _uintToString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
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
