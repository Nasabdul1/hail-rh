// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DialProtocol {
    struct Call {
        address caller;
        address recipient;
        uint256 timestamp;
        uint256 value;
        bool answered;
        bool ended;
        bytes data;
    }

    Call[] public calls;
    mapping(address => uint256[]) public userCalls;
    mapping(address => uint256) public earnings;

    uint256 public constant PLATFORM_FEE_BPS = 0; // 0% — all calls are free
    uint256 public constant CALL_TIMEOUT = 60 seconds;

    address public owner;

    event CallInitiated(
        uint256 indexed callId,
        address indexed caller,
        address indexed recipient,
        uint256 timestamp
    );
    event CallAnswered(uint256 indexed callId, uint256 timestamp);
    event CallEnded(uint256 indexed callId, uint256 duration);

    constructor() {
        owner = msg.sender;
    }

    function initiateCall(address recipient, bytes calldata data) external payable returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot call yourself");

        uint256 callId = calls.length;
        calls.push(Call({
            caller: msg.sender,
            recipient: recipient,
            timestamp: block.timestamp,
            value: 0,
            answered: false,
            ended: false,
            data: data
        }));

        userCalls[msg.sender].push(callId);
        userCalls[recipient].push(callId);

        emit CallInitiated(callId, msg.sender, recipient, block.timestamp);
        return callId;
    }

    function answerCall(uint256 callId) external {
        Call storage c = calls[callId];
        require(c.recipient == msg.sender, "Not recipient");
        require(!c.answered, "Already answered");
        require(!c.ended, "Call ended");
        require(block.timestamp <= c.timestamp + CALL_TIMEOUT, "Call expired");

        c.answered = true;
        emit CallAnswered(callId, block.timestamp);
    }

    function endCall(uint256 callId) external {
        Call storage c = calls[callId];
        require(c.caller == msg.sender || c.recipient == msg.sender, "Not participant");
        require(!c.ended, "Already ended");

        c.ended = true;
        uint256 duration = block.timestamp - c.timestamp;
        emit CallEnded(callId, duration);
    }

    function getUserCalls(address user) external view returns (uint256[] memory) {
        return userCalls[user];
    }

    function getCallDetails(uint256 callId) external view returns (Call memory) {
        return calls[callId];
    }

    receive() external payable {}
}
