// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DialProtocol {
    struct Call {
        address caller;
        address recipient;
        uint256 timestamp;
        bool answered;
        bool ended;
        bytes data;
    }

    Call[] public calls;
    mapping(address => uint256[]) public userCalls;

    uint256 public constant PLATFORM_FEE_BPS = 0; // 0% — all calls are free
    uint256 public constant CALL_TIMEOUT = 60 seconds;

    event CallInitiated(
        uint256 indexed callId,
        address indexed caller,
        address indexed recipient,
        uint256 timestamp
    );
    event CallAnswered(uint256 indexed callId, uint256 timestamp);
    event CallEnded(uint256 indexed callId, uint256 duration);

    function initiateCall(address recipient, bytes calldata data) external returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot call yourself");
        require(data.length <= 256, "Data too large");

        uint256 callId = calls.length;
        calls.push(Call({
            caller: msg.sender,
            recipient: recipient,
            timestamp: block.timestamp,
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
        require(callId < calls.length, "Invalid call ID");
        Call storage c = calls[callId];
        require(c.recipient == msg.sender, "Not recipient");
        require(!c.answered, "Already answered");
        require(!c.ended, "Call ended");
        require(block.timestamp <= c.timestamp + CALL_TIMEOUT, "Call expired");

        c.answered = true;
        emit CallAnswered(callId, block.timestamp);
    }

    function endCall(uint256 callId) external {
        require(callId < calls.length, "Invalid call ID");
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
        require(callId < calls.length, "Invalid call ID");
        return calls[callId];
    }
}
