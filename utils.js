import fs from 'fs';

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

// Assign participants to each other
function assignParticipants(participantsData) {
    let validAssignments = false;

    while (!validAssignments) {
        // Reset the assignments
        participantsData.forEach(participant => participant.assigned = null);

        // Get an array of user IDs
        const userIds = participantsData.map(participant => participant.userId);
        const shuffledUserIds = shuffleArray(userIds.slice()); // Make a copy of the array and shuffle it

        // Initialize an array to store the assignments
        const assignments = [];

        // Create a copy of the shuffledUserIds for assigning
        const remainingUserIds = shuffledUserIds.slice();

        // Loop through shuffled user IDs
        for (let i = 0; i < shuffledUserIds.length; i++) {
            const senderId = shuffledUserIds[i];
            const receiverId = findUniqueReceiver(senderId, remainingUserIds);

            if (!receiverId) {
                console.error('Unable to find a unique receiver for:', senderId);
                continue;
            }

            // Update the assignment information in participantsData
            const senderIndex = participantsData.findIndex(participant => participant.userId === senderId);
            participantsData[senderIndex].assigned = receiverId;

            // Remove the assigned receiver from remainingUserIds
            const receiverIndex = remainingUserIds.indexOf(receiverId);
            if (receiverIndex > -1) {
                remainingUserIds.splice(receiverIndex, 1);
            }

            // Store the assignment information
            const assignment = {
                senderId: senderId,
                receiverId: receiverId
            };
            assignments.push(assignment);
        }

        // Check if every participant has been assigned a unique person and no participant is assigned twice
        const assignedUserIds = participantsData.map(participant => participant.assigned);
        const uniqueAssignedUserIds = [...new Set(assignedUserIds)];

        if (assignedUserIds.length === uniqueAssignedUserIds.length && !uniqueAssignedUserIds.includes(null)) {
            // Ensure no participant is assigned more than once
            const assignmentCounts = assignedUserIds.reduce((acc, id) => {
                acc[id] = (acc[id] || 0) + 1;
                return acc;
            }, {});

            if (!Object.values(assignmentCounts).some(count => count > 1)) {
                validAssignments = true;
            }
        }
    }

    return participantsData;
}

export {
    initializeParticipantsFile,
    extractSteamID64,
    shuffleArray,
    readParticipantsFile,
    writeParticipantsFile,
    findUniqueReceiver,
    assignParticipants
};
