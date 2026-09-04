// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DialProtocol.sol";
import "../src/TokenFactory.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        require(block.chainid == 4663, "Wrong chain");

        vm.startBroadcast(deployerPrivateKey);

        DialProtocol dial = new DialProtocol();
        TokenFactory factory = new TokenFactory();

        console.log("DialProtocol deployed at:", address(dial));
        console.log("TokenFactory deployed at:", address(factory));

        vm.stopBroadcast();
    }
}
