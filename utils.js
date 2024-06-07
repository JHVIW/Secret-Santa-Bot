const fs = require('fs');

// Initialize the JSON file with an empty array if it doesn't exist
function initializeParticipantsFile(participantsFilePath) {
    if (!fs.existsSync(participantsFilePath)) {
        fs.writeFileSync(participantsFilePath, '[]', 'utf8');
        console.log('Initialized participants.json with an empty array.');
    }
}

// Extract SteamID64 from a Steam trade link
function extractSteamID64(tradeLink) {
    const match = /partner=(\d+)/.exec(tradeLink);
    if (match && match[1]) {
        const partnerId = parseInt(match[1]);
        if (!isNaN(partnerId)) {
            return (BigInt(1) << 56n) | (BigInt(1) << 52n) | (BigInt(1) << 32n) | BigInt(partnerId);
        }
    }
    return null; // Return null if extraction fails
}

// Shuffle an array using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Read participants from file
function readParticipantsFile(participantsFilePath, callback) {
    fs.readFile(participantsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading participants.json:', err);
            return callback(err, null);
        }
        const participantsData = JSON.parse(data);
        callback(null, participantsData);
    });
}

// Write participants to file
function writeParticipantsFile(participantsFilePath, participantsData, callback) {
    fs.writeFile(participantsFilePath, JSON.stringify(participantsData, null, 4), (err) => {
        if (err) {
            console.error('Error writing participants.json:', err);
            return callback(err);
        }
        console.log('Participants data saved to participants.json');
        callback(null);
    });
}

// Find a unique receiver for each sender
function findUniqueReceiver(senderId, remainingUserIds) {
    let receiverId = senderId;
    const remainingReceivers = remainingUserIds.filter(id => id !== senderId);
    if (remainingReceivers.length === 0) {
        return null;
    }
    receiverId = remainingReceivers[Math.floor(Math.random() * remainingReceivers.length)];
    return receiverId;
}

module.exports = {
    initializeParticipantsFile,
    extractSteamID64,
    shuffleArray,
    readParticipantsFile,
    writeParticipantsFile,
    findUniqueReceiver,
};
