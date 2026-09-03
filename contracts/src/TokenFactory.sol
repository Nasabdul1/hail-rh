// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./HailToken.sol";

contract TokenFactory {
    struct TokenInfo {
        address tokenAddress;
        string name;
        string symbol;
        uint256 supply;
        address creator;
        uint256 createdAt;
    }

    TokenInfo[] public tokens;
    mapping(address => uint256[]) public creatorTokens;

    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 supply,
        address indexed creator
    );

    function createToken(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) external returns (address tokenAddress) {
        HailToken token = new HailToken(_name, _symbol, msg.sender);
        tokenAddress = address(token);

        if (_initialSupply > 0) {
            token.addMinter(address(this));
            token.mint(msg.sender, _initialSupply * 10**18);
            token.removeMinter(address(this));
        }

        TokenInfo memory info = TokenInfo({
            tokenAddress: tokenAddress,
            name: _name,
            symbol: _symbol,
            supply: _initialSupply,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        tokens.push(info);
        creatorTokens[msg.sender].push(tokens.length - 1);

        emit TokenCreated(tokenAddress, _name, _symbol, _initialSupply, msg.sender);
        return tokenAddress;
    }

    function getAllTokens() external view returns (TokenInfo[] memory) {
        return tokens;
    }

    function getCreatorTokens(address _creator) external view returns (uint256[] memory) {
        return creatorTokens[_creator];
    }

    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }
}
