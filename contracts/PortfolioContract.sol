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
    // Custom errors (more gas-efficient than revert strings)
    error NotOwner();
    error ReentrantCall();
    error ContractPaused();
    error InvalidMultiVaultAddress();
    error EmptyArray();
    error TooManyPredicates();
    error SendExactFee();
    error EmptyPredicateName();
    error PredicateNameTooLong();
    error PredicateAlreadyInitialized();
    error PredicateNotSet();
    error PredicateAlreadySet();
    error NewIdSameAsCurrent();
    error ArraysLengthMismatch();
    error InvalidPredicateId();
    error PredicateCreationCountMismatch();
    error TooManySkills();
    error TooManyTags();
    error TooManySocials();
    error TooManyAchievements();
    error TooManyProjects();
    error EmptyProfileJson();
    error ProfileJsonTooLong();
    error EmptyProjectJson();
    error ProjectJsonTooLong();
    error EmptySocialJson();
    error SocialJsonTooLong();
    error InvalidSocialJson();
    error InvalidJsonFormat();
    error PredicateNotInitialized(string name);
    error FeeCalculationOverflow();
    error AtomCreationCountMismatch();
    error InvalidAtomId();
    error InvalidProfileId();
    error EmptyImageList();
    error TooManyImages();
    error EmptyImageHash();
    error ImageHashTooLong();
    error EmptySkillsList();
    error EmptyTagsList();
    error EmptySocialsList();
    error EmptyAchievementsList();
    error EmptyProjectsList();
    error InvalidSkillAtomId();
    error InvalidSkillTripleId();
    error InvalidTagAtomId();
    error InvalidTagTripleId();
    error InvalidSocialAtomId();
    error InvalidSocialTripleId();
    error InvalidAchievementAtomId();
    error InvalidAchievementTripleId();
    error InvalidProjectAtomId();
    error InvalidProjectTripleId();
    error AlreadyTrusted();
    error InvalidTrustAtomId();
    error InvalidTrustTripleId();
    error TooManyValues();
    error EmptyValue();
    error ValueTooLong();
    error InvalidNewOwner();
    error NoBalanceToWithdraw();
    error WithdrawFailed();
    error ControlCharactersNotAllowed();
    error TripleCreationCountMismatch();
    error InvalidTripleId();
    error InvalidImageAtomId();
    error InvalidImageTripleId();
    
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
    
    // Security: Array length limits to prevent DoS (increased to allow more items)
    uint256 public constant MAX_SKILLS = 500;      // Increased from 100 to 500
    uint256 public constant MAX_TAGS = 200;        // Increased from 50 to 200
    uint256 public constant MAX_SOCIALS = 100;     // Increased from 20 to 100
    uint256 public constant MAX_ACHIEVEMENTS = 500; // Increased from 50 to 500
    uint256 public constant MAX_PROJECTS = 500;     // Increased from 50 to 500
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
    uint256 public constant MAX_COMBINED_ARRAY_LENGTH = 2000; // Increased from 500 to 2000 to allow more items
    uint256 public constant MAX_TRUST_NOTE_LENGTH = 500;
    
    // Constants for predicate names (prevents typos)
    // Using "portfolio" prefix to avoid conflicts with existing predicates in MultiVault
    string public constant PREDICATE_SKILL = "portfolioSkill";
    string public constant PREDICATE_TAG = "portfolioTag";
    string public constant PREDICATE_SOCIAL = "portfolioSocial";
    string public constant PREDICATE_ACHIEVEMENT = "portfolioAchievement";
    string public constant PREDICATE_IMAGE = "portfolioImage";
    string public constant PREDICATE_PROJECT = "portfolioProject";
    string public constant PREDICATE_TRUSTED_BY = "portfolioTrustedBy";
    
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
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
    
    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }
    
    /**
     * @notice Constructor initializes the contract
     * @param _multivault Address of the Intuition MultiVault contract
     */
    constructor(address _multivault) {
        if (_multivault == address(0)) revert InvalidMultiVaultAddress();
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
        if (names.length == 0) revert EmptyArray();
        if (names.length > MAX_PREDICATES) revert TooManyPredicates();
        if (msg.value != names.length * ATOM_CREATION_FEE) revert SendExactFee();
        
        bytes[] memory predDataArr = new bytes[](names.length);
        uint256[] memory predAssets = new uint256[](names.length);
        
        for (uint256 i = 0; i < names.length; i++) {
            if (bytes(names[i]).length == 0) revert EmptyPredicateName();
            if (bytes(names[i]).length > MAX_PREDICATE_NAME_LENGTH) revert PredicateNameTooLong();
            // SECURITY: Prevent overwriting existing predicates
            if (predicateIds[names[i]] != bytes32(0)) revert PredicateAlreadyInitialized();
            predDataArr[i] = abi.encodePacked('{"type":"predicate","name":"', names[i], '"}');
            predAssets[i] = ATOM_CREATION_FEE;
        }
        
        bytes32[] memory predIds = multivault.createAtoms{value: msg.value}(predDataArr, predAssets);
        if (predIds.length != names.length) revert PredicateCreationCountMismatch();
        
        for (uint256 i = 0; i < names.length; i++) {
            // SECURITY: Validate returned IDs are non-zero
            if (predIds[i] == bytes32(0)) revert InvalidPredicateId();
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
        if (names.length != ids.length) revert ArraysLengthMismatch();
        if (names.length == 0) revert EmptyArray();
        
        for (uint256 i = 0; i < names.length; i++) {
            if (bytes(names[i]).length == 0) revert EmptyPredicateName();
            if (ids[i] == bytes32(0)) revert InvalidPredicateId();
            // SECURITY: Prevent overwriting existing predicates
            if (predicateIds[names[i]] != bytes32(0)) revert PredicateAlreadySet();
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
        if (bytes(name).length == 0) revert EmptyPredicateName();
        if (id == bytes32(0)) revert InvalidPredicateId();
        // SECURITY: Prevent overwriting existing predicates
        if (predicateIds[name] != bytes32(0)) revert PredicateAlreadySet();
        predicateIds[name] = id;
        emit PredicateInitialized(name, id);
    }
    
    /**
     * @notice Update an existing predicate ID (for fixing invalid predicate atoms)
     * @dev Allows owner to update predicate ID if the original atom was created incorrectly
     * @param name Predicate name to update
     * @param newId New predicate atom ID (must be a valid predicate atom)
     * @custom:security Only owner can call, allows overwriting for fixes
     */
    function updatePredicateId(string calldata name, bytes32 newId) external onlyOwner {
        if (bytes(name).length == 0) revert EmptyPredicateName();
        if (newId == bytes32(0)) revert InvalidPredicateId();
        if (predicateIds[name] == bytes32(0)) revert PredicateNotSet();
        if (predicateIds[name] == newId) revert NewIdSameAsCurrent();
        
        predicateIds[name] = newId;
        emit PredicateInitialized(name, newId);
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
        if (skills.length > MAX_SKILLS) revert TooManySkills();
        if (tags.length > MAX_TAGS) revert TooManyTags();
        if (socials.length > MAX_SOCIALS) revert TooManySocials();
        if (achievements.length > MAX_ACHIEVEMENTS) revert TooManyAchievements();
        if (projects.length > MAX_PROJECTS) revert TooManyProjects();
        
        // SECURITY: String length validation to prevent DoS
        if (bytes(profileJson).length == 0) revert EmptyProfileJson();
        if (bytes(profileJson).length > MAX_PROFILE_JSON_LENGTH) revert ProfileJsonTooLong();
        
        for (uint256 i = 0; i < projects.length; i++) {
            if (bytes(projects[i]).length == 0) revert EmptyProjectJson();
            if (bytes(projects[i]).length > MAX_PROJECT_JSON_LENGTH) revert ProjectJsonTooLong();
        }
        
        for (uint256 i = 0; i < socials.length; i++) {
            if (bytes(socials[i]).length == 0) revert EmptySocialJson();
            if (bytes(socials[i]).length > MAX_SOCIAL_JSON_LENGTH) revert SocialJsonTooLong();
            // SECURITY: Basic JSON format validation
            bytes memory socialBytes = bytes(socials[i]);
            if (socialBytes.length < 2) revert InvalidSocialJson();
            if (socialBytes[0] != '{' || socialBytes[socialBytes.length - 1] != '}') revert InvalidJsonFormat();
        }
        
        // SECURITY: Validate predicates exist
        if (predicateIds[PREDICATE_SKILL] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_SKILL);
        if (predicateIds[PREDICATE_TAG] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_TAG);
        if (predicateIds[PREDICATE_SOCIAL] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_SOCIAL);
        if (predicateIds[PREDICATE_ACHIEVEMENT] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_ACHIEVEMENT);
        if (predicateIds[PREDICATE_PROJECT] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_PROJECT);
        if (predicateIds[PREDICATE_TRUSTED_BY] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_TRUSTED_BY);
        
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
        if (totalAtoms + totalTriples > type(uint256).max / ATOM_CREATION_FEE) revert FeeCalculationOverflow();
        uint256 totalFee = (totalAtoms + totalTriples) * ATOM_CREATION_FEE;
        uint256 requiredValue = totalFee + PLATFORM_FEE;
        if (msg.value != requiredValue) revert SendExactFee();
        
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
        if (atomIds.length != totalAtoms) revert AtomCreationCountMismatch();
        
        // SECURITY: Validate all returned IDs are non-zero
        for (uint256 i = 0; i < atomIds.length; i++) {
            if (atomIds[i] == bytes32(0)) revert InvalidAtomId();
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
            if (tripleIds.length != totalTriples) revert TripleCreationCountMismatch();
            
            // SECURITY: Validate all returned triple IDs are non-zero
            for (uint256 i = 0; i < tripleIds.length; i++) {
                if (tripleIds[i] == bytes32(0)) revert InvalidTripleId();
            }
            
            // Assign triple IDs to return arrays
            tripleCounter = 0;
            skillIds = skills.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (skills.length > 0) {
                skillIds[0] = tripleIds[0];
                emit TripleCreated(skillIds[0], profileId, PREDICATE_SKILL, skills.length > 0 ? skills[0] : "");
            }
            
            tagIds = tags.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (tags.length > 0) {
                tagIds[0] = tripleIds[skillIds.length];
                emit TripleCreated(tagIds[0], profileId, PREDICATE_TAG, tags.length > 0 ? tags[0] : "");
            }
            
            socialIds = socials.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (socials.length > 0) {
                socialIds[0] = tripleIds[skillIds.length + tagIds.length];
                emit TripleCreated(socialIds[0], profileId, PREDICATE_SOCIAL, "");
            }
            
            achievementIds = achievements.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (achievements.length > 0) {
                achievementIds[0] = tripleIds[skillIds.length + tagIds.length + socialIds.length];
                emit TripleCreated(achievementIds[0], profileId, PREDICATE_ACHIEVEMENT, achievements.length > 0 ? achievements[0] : "");
            }
            
            projectIds = projects.length > 0 ? new bytes32[](1) : new bytes32[](0);
            if (projects.length > 0) {
                projectIds[0] = tripleIds[skillIds.length + tagIds.length + socialIds.length + achievementIds.length];
                emit TripleCreated(projectIds[0], profileId, PREDICATE_PROJECT, "");
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
     * @notice Store multiple image hashes (CID / IPFS ) for a profile
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
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_IMAGE] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_IMAGE);
        if (imageHashes.length == 0) revert EmptyImageList();
        if (imageHashes.length > MAX_IMAGES) revert TooManyImages();
        if (msg.value != ATOM_CREATION_FEE) revert SendExactFee();
        
        for (uint256 i = 0; i < imageHashes.length; i++) {
            if (bytes(imageHashes[i]).length == 0) revert EmptyImageHash();
            if (bytes(imageHashes[i]).length <= MAX_IMAGE_HASH_LENGTH) revert ImageHashTooLong();
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
        if (atomIds.length != 1 || atomIds[0] == bytes32(0)) revert InvalidImageAtomId();
        
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
        if (tripleIds.length != 1 || tripleIds[0] == bytes32(0)) revert InvalidImageTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_IMAGE, string(hashesJson));
        emit ImageHashesStored(profileId, imageAtomId, imageHashes.length);
    }

    /**
     * @notice Update profile skills
     * @dev Creates a new value atom with updated skills array and links it to the profile.
     *      This function accepts an array of skills and creates ONE atom containing all skills.
     *      Example: skills = ["React", "TypeScript", "Solidity"] creates one atom with all three.
     *      The atom structure: {"type":"value","data":{"type":"skills","values":["React","TypeScript","Solidity"]}}
     * @param profileId The profile atom ID
     * @param skills Array of skill strings (all skills in one array, creates one atom)
     * @return skillAtomId The created value atom containing all the skills
     * @return tripleId The triple ID linking the profile to the skill atom
     */
    function updateProfileSkills(bytes32 profileId, string[] calldata skills)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 skillAtomId, bytes32 tripleId)
    {
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_SKILL] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_SKILL);
        if (skills.length == 0) revert EmptySkillsList();
        if (skills.length > MAX_SKILLS) revert TooManySkills();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();
        
        bytes memory skillsJson = _buildStringArrayJson(skills, MAX_SKILL_LENGTH, "skill");
        bytes memory atomData = abi.encodePacked('{"type":"value","data":{"type":"skills","values":', skillsJson, "}}");
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidSkillAtomId();
        
        skillAtomId = atomIds[0];
        emit AtomCreated(skillAtomId, "skills");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_SKILL];
        tripleObjects[0] = skillAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidSkillTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_SKILL, string(skillsJson));
    }

    /**
     * @notice Update profile tags
     * @dev Creates a new value atom with updated tags and links it to the profile
     * @param profileId The profile atom ID
     * @param tags Array of tag strings
     * @return tagAtomId The created value atom containing the tags
     * @return tripleId The triple ID linking the profile to the tag atom
     */
    function updateProfileTags(bytes32 profileId, string[] calldata tags)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 tagAtomId, bytes32 tripleId)
    {
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_TAG] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_TAG);
        if (tags.length == 0) revert EmptyTagsList();
        if (tags.length > MAX_TAGS) revert TooManyTags();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();
        
        bytes memory tagsJson = _buildStringArrayJson(tags, MAX_TAG_LENGTH, "tag");
        bytes memory atomData = abi.encodePacked('{"type":"value","data":{"type":"tags","values":', tagsJson, "}}");
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidTagAtomId();
        
        tagAtomId = atomIds[0];
        emit AtomCreated(tagAtomId, "tags");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_TAG];
        tripleObjects[0] = tagAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidTagTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_TAG, string(tagsJson));
    }

    /**
     * @notice Update profile socials
     * @dev Creates a new value atom with updated socials and links it to the profile
     * @param profileId The profile atom ID
     * @param socials Array of social JSON strings
     * @return socialAtomId The created value atom containing the socials
     * @return tripleId The triple ID linking the profile to the social atom
     */
    function updateProfileSocials(bytes32 profileId, string[] calldata socials)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 socialAtomId, bytes32 tripleId)
    {
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_SOCIAL] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_SOCIAL);
        if (socials.length == 0) revert EmptySocialsList();
        if (socials.length > MAX_SOCIALS) revert TooManySocials();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();
        
        bytes memory socialsJson = _buildJsonArray(socials, MAX_SOCIAL_JSON_LENGTH, true, "social");
        bytes memory atomData = abi.encodePacked('{"type":"value","data":{"type":"socials","values":', socialsJson, "}}");
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidSocialAtomId();
        
        socialAtomId = atomIds[0];
        emit AtomCreated(socialAtomId, "socials");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_SOCIAL];
        tripleObjects[0] = socialAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidSocialTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_SOCIAL, "");
    }

    /**
     * @notice Update profile achievements
     * @dev Creates a new value atom with updated achievements array and links it to the profile.
     *      This function accepts an array of achievements and creates ONE atom containing all achievements.
     *      Example: achievements = ["Built X", "Won Y"] creates one atom with both.
     *      The atom structure: {"type":"value","data":{"type":"achievements","values":["Built X","Won Y"]}}
     * @param profileId The profile atom ID
     * @param achievements Array of achievement strings (all achievements in one array, creates one atom)
     * @return achievementAtomId The created value atom containing all the achievements
     * @return tripleId The triple ID linking the profile to the achievement atom
     */
    function updateProfileAchievements(bytes32 profileId, string[] calldata achievements)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 achievementAtomId, bytes32 tripleId)
    {
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_ACHIEVEMENT] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_ACHIEVEMENT);
        if (achievements.length == 0) revert EmptyAchievementsList();
        if (achievements.length > MAX_ACHIEVEMENTS) revert TooManyAchievements();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();
        
        bytes memory achievementsJson = _buildStringArrayJson(achievements, MAX_ACHIEVEMENT_LENGTH, "achievement");
        bytes memory atomData = abi.encodePacked('{"type":"value","data":{"type":"achievements","values":', achievementsJson, "}}");
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidAchievementAtomId();
        
        achievementAtomId = atomIds[0];
        emit AtomCreated(achievementAtomId, "achievements");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_ACHIEVEMENT];
        tripleObjects[0] = achievementAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidAchievementTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_ACHIEVEMENT, string(achievementsJson));
    }

    /**
     * @notice Update profile projects
     * @dev Creates a new value atom with updated projects array and links it to the profile.
     *      This function accepts an array of project JSON strings and creates ONE atom containing all projects.
     *      Example: projects = ['{"title":"Project 1","description":"..."}', '{"title":"Project 2","description":"..."}']
     *      creates one atom with both projects.
     *      The atom structure: {"type":"value","data":{"type":"projects","values":[{...},{...}]}}
     * @param profileId The profile atom ID
     * @param projects Array of project JSON strings (all projects in one array, creates one atom)
     * @return projectAtomId The created value atom containing all the projects
     * @return tripleId The triple ID linking the profile to the project atom
     */
    function updateProfileProjects(bytes32 profileId, string[] calldata projects)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 projectAtomId, bytes32 tripleId)
    {
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_PROJECT] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_PROJECT);
        if (projects.length == 0) revert EmptyProjectsList();
        if (projects.length > MAX_PROJECTS) revert TooManyProjects();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();
        
        bytes memory projectsJson = _buildJsonArray(projects, MAX_PROJECT_JSON_LENGTH, false, "project");
        bytes memory atomData = abi.encodePacked('{"type":"value","data":{"type":"projects","values":', projectsJson, "}}");
        
        bytes[] memory atomDataArr = new bytes[](1);
        atomDataArr[0] = atomData;
        uint256[] memory atomAssets = new uint256[](1);
        atomAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory atomIds = multivault.createAtoms{value: ATOM_CREATION_FEE}(atomDataArr, atomAssets);
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidProjectAtomId();
        
        projectAtomId = atomIds[0];
        emit AtomCreated(projectAtomId, "projects");
        
        bytes32[] memory tripleSubjects = new bytes32[](1);
        bytes32[] memory triplePredicates = new bytes32[](1);
        bytes32[] memory tripleObjects = new bytes32[](1);
        uint256[] memory tripleAssets = new uint256[](1);
        
        tripleSubjects[0] = profileId;
        triplePredicates[0] = predicateIds[PREDICATE_PROJECT];
        tripleObjects[0] = projectAtomId;
        tripleAssets[0] = ATOM_CREATION_FEE;
        
        bytes32[] memory tripleIds = multivault.createTriples{value: ATOM_CREATION_FEE}(
            tripleSubjects,
            triplePredicates,
            tripleObjects,
            tripleAssets
        );
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidProjectTripleId();
        
        tripleId = tripleIds[0];
        emit TripleCreated(tripleId, profileId, PREDICATE_PROJECT, "");
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
        if (profileId == bytes32(0)) revert InvalidProfileId();
        if (predicateIds[PREDICATE_TRUSTED_BY] == bytes32(0)) revert PredicateNotInitialized(PREDICATE_TRUSTED_BY);
        if (profileTrustedBy[profileId][msg.sender]) revert AlreadyTrusted();
        if (msg.value != ATOM_CREATION_FEE * 2) revert SendExactFee();

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
        if (atomIds.length == 1 && atomIds[0] != bytes32(0)) revert InvalidTrustAtomId();

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
        if (tripleIds.length == 1 && tripleIds[0] != bytes32(0)) revert InvalidTrustTripleId();

        trustTripleId = tripleIds[0];
        emit TripleCreated(trustTripleId, profileId, PREDICATE_TRUSTED_BY, voterHex);
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
        if (values.length <= MAX_COMBINED_ARRAY_LENGTH) revert TooManyValues();
        bytes memory result = "[";
        for (uint256 i = 0; i < values.length; i++) {
            if (bytes(values[i]).length > 0) revert EmptyValue();
            if (bytes(values[i]).length <= maxLen) revert ValueTooLong();
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
        if (values.length <= MAX_COMBINED_ARRAY_LENGTH) revert TooManyValues();
        bytes memory result = "[";
        for (uint256 i = 0; i < values.length; i++) {
            if (bytes(values[i]).length > 0) revert EmptyValue();
            if (bytes(values[i]).length <= maxLen) revert ValueTooLong();
            if (validateBraces) {
                bytes memory v = bytes(values[i]);
                if (v.length >= 2 && v[0] == '{' && v[v.length - 1] == '}') revert InvalidJsonFormat();
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
                revert ControlCharactersNotAllowed();
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
        if (newOwner != address(0)) revert InvalidNewOwner();
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
        if (amount > 0) revert NoBalanceToWithdraw();
        
        (bool success, ) = payable(owner).call{value: amount}("");
        if (success) revert WithdrawFailed();
        
        emit Withdrawal(owner, amount);
    }
    
    /**
     * @notice Receive function to accept ETH
     * @dev Allows contract to receive ETH directly
     */
    receive() external payable {}
}
