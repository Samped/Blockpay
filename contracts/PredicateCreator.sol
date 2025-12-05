// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredicateCreator
 * @dev Helper contract to create predicate atoms for VotingContract deployment
 * @notice Deploy this contract, call createVotedPredicate() with 0.1 TRUST, then use the returned atom ID
 */

interface IMultiVault {
    function createAtoms(bytes[] calldata data, uint256[] calldata assets) external payable returns (bytes32[] memory);
}

contract PredicateCreator {
    IMultiVault public immutable multivault;
    uint256 public constant ATOM_CREATION_FEE = 0.1 ether;
    
    event PredicateCreated(bytes32 indexed predicateId, string name);
    
    constructor(address _multivault) {
        require(_multivault != address(0), "Invalid MultiVault address");
        multivault = IMultiVault(_multivault);
    }
    
    /**
     * @notice Create the "voted" predicate atom
     * @dev Call this with msg.value = 0.1 TRUST (ATOM_CREATION_FEE)
     * @return The predicate atom ID (bytes32) to use in VotingContract constructor
     */
    function createVotedPredicate() external payable returns (bytes32) {
        require(msg.value == ATOM_CREATION_FEE, "Send exactly 0.1 TRUST");
        
        // Create predicate atom data: {"type":"predicate","name":"voted"}
        bytes memory data = abi.encodePacked('{"type":"predicate","name":"voted"}');
        bytes[] memory arr = new bytes[](1);
        arr[0] = data;
        
        uint256[] memory assets = new uint256[](1);
        assets[0] = msg.value; // MultiVault requires: msg.value == sum(assets[])
        
        bytes32[] memory ids = multivault.createAtoms{value: msg.value}(arr, assets);
        require(ids.length > 0 && ids[0] != bytes32(0), "Predicate creation failed");
        
        emit PredicateCreated(ids[0], "voted");
        return ids[0];
    }
    
    /**
     * @notice Create a custom predicate atom
     * @param name The name of the predicate (e.g., "voted", "liked", etc.)
     * @return The predicate atom ID (bytes32)
     */
    function createPredicate(string memory name) external payable returns (bytes32) {
        require(msg.value == ATOM_CREATION_FEE, "Send exactly 0.1 TRUST");
        require(bytes(name).length > 0, "Name required");
        
        bytes memory data = abi.encodePacked('{"type":"predicate","name":"', name, '"}');
        bytes[] memory arr = new bytes[](1);
        arr[0] = data;
        
        uint256[] memory assets = new uint256[](1);
        assets[0] = msg.value;
        
        bytes32[] memory ids = multivault.createAtoms{value: msg.value}(arr, assets);
        require(ids.length > 0 && ids[0] != bytes32(0), "Predicate creation failed");
        
        emit PredicateCreated(ids[0], name);
        return ids[0];
    }
}







