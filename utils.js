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

// Assign participants to each other using a circular shift approach
// This ensures every person gets a unique recipient and creates a circular chain
// 100% guarantee that no one is assigned twice
function assignParticipants(participantsData) {
    // Check if we have at least 2 participants
    if (participantsData.length < 2) {
        console.error('Need at least 2 participants to assign pairs');
        return participantsData;
    }

    // Reset all assignments
    participantsData.forEach(participant => participant.assigned = null);

    // Get an array of user IDs
    const userIds = participantsData.map(participant => participant.userId);
    
    // Remove any duplicate user IDs (safety check)
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length !== userIds.length) {
        console.error('Warning: Duplicate user IDs detected. Removing duplicates.');
    }
    
    // Shuffle the array to randomize the assignments
    const shuffledUserIds = shuffleArray(uniqueUserIds.slice());

    // Track which receivers have already been assigned (Set for O(1) lookup)
    const assignedReceivers = new Set();
    
    // Track assignments as we make them for validation
    const assignmentMap = new Map();

    // Create a circular assignment: person[i] gives to person[(i+1) % n]
    // This mathematically guarantees:
    // 1. Everyone gets a unique recipient (each index is unique, modulo creates perfect distribution)
    // 2. No one gets themselves (circular shift means i+1 can never equal i when n > 1)
    // 3. No one is assigned twice (each receiver appears exactly once in the circular chain)
    // 4. Creates a complete circular chain (A -> B -> C -> ... -> A)
    for (let i = 0; i < shuffledUserIds.length; i++) {
        const senderId = shuffledUserIds[i];
        // Assign to the next person in the shuffled list (circular)
        const receiverId = shuffledUserIds[(i + 1) % shuffledUserIds.length];
        
        // VALIDATION: Ensure sender is not assigning to themselves
        if (senderId === receiverId) {
            console.error(`ERROR: Circular assignment would assign ${senderId} to themselves. This should never happen with n > 1.`);
            throw new Error('Invalid assignment: sender and receiver are the same');
        }
        
        // VALIDATION: Ensure this receiver hasn't already been assigned
        if (assignedReceivers.has(receiverId)) {
            console.error(`ERROR: Receiver ${receiverId} has already been assigned!`);
            console.error('Current assignments:', Array.from(assignedReceivers));
            throw new Error(`Duplicate assignment detected: ${receiverId} is assigned twice`);
        }
        
        // VALIDATION: Ensure this sender hasn't already been processed
        if (assignmentMap.has(senderId)) {
            console.error(`ERROR: Sender ${senderId} has already been processed!`);
            throw new Error(`Duplicate sender detected: ${senderId} is processed twice`);
        }
        
        // Mark this receiver as assigned
        assignedReceivers.add(receiverId);
        assignmentMap.set(senderId, receiverId);
        
        // Find the sender in participantsData and assign the receiver
        const senderIndex = participantsData.findIndex(participant => participant.userId === senderId);
        if (senderIndex !== -1) {
            participantsData[senderIndex].assigned = receiverId;
        } else {
            console.error(`ERROR: Could not find participant with userId: ${senderId}`);
            throw new Error(`Participant not found: ${senderId}`);
        }
    }

    // FINAL VALIDATION: Comprehensive check
    const assignedUserIds = participantsData.map(participant => participant.assigned);
    const uniqueAssignedUserIds = [...new Set(assignedUserIds)];
    
    // Check 1: All participants have been assigned (no nulls)
    if (assignedUserIds.includes(null)) {
        const nullIndices = assignedUserIds
            .map((id, idx) => id === null ? idx : -1)
            .filter(idx => idx !== -1);
        console.error(`ERROR: ${nullIndices.length} participant(s) have null assignment:`, nullIndices);
        throw new Error('Some participants have null assignments');
    }
    
    // Check 2: All assigned IDs are unique (no duplicates)
    if (assignedUserIds.length !== uniqueAssignedUserIds.length) {
        const duplicates = assignedUserIds.filter((id, idx) => assignedUserIds.indexOf(id) !== idx);
        console.error(`ERROR: Duplicate assignments found:`, duplicates);
        throw new Error('Duplicate assignments detected in final validation');
    }
    
    // Check 3: Number of assignments matches number of participants
    if (assignedUserIds.length !== participantsData.length) {
        console.error(`ERROR: Assignment count mismatch. Expected ${participantsData.length}, got ${assignedUserIds.length}`);
        throw new Error('Assignment count mismatch');
    }
    
    // Check 4: No one is assigned to themselves
    const selfAssignments = participantsData.filter(p => p.userId === p.assigned);
    if (selfAssignments.length > 0) {
        console.error(`ERROR: ${selfAssignments.length} participant(s) assigned to themselves:`, 
            selfAssignments.map(p => p.userId));
        throw new Error('Self-assignments detected');
    }
    
    // Check 5: All receivers exist in participants list
    const allUserIds = new Set(participantsData.map(p => p.userId));
    const invalidReceivers = assignedUserIds.filter(id => !allUserIds.has(id));
    if (invalidReceivers.length > 0) {
        console.error(`ERROR: Invalid receivers found:`, invalidReceivers);
        throw new Error('Invalid receivers detected');
    }
    
    // All validations passed
    console.log(`✅ Successfully assigned ${participantsData.length} participants with 100% unique assignments`);
    console.log(`✅ Assignment chain: ${shuffledUserIds.map((id, i) => 
        `${id} -> ${shuffledUserIds[(i + 1) % shuffledUserIds.length]}`
    ).join(', ')}`);

    return participantsData;
}

export {
    initializeParticipantsFile,
    extractSteamID64,
    shuffleArray,
    readParticipantsFile,
    writeParticipantsFile,
    assignParticipants
};
