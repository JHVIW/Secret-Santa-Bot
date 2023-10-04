import { config } from 'dotenv';
import Discord from 'discord.js';
import fs from 'fs';
config();

const { Client, Intents } = Discord;

const intents = new Intents([
    Intents.FLAGS.GUILDS,           // Required for basic information about servers
    Intents.FLAGS.GUILD_MESSAGES,   // Required for message-related events
]);

const client = new Client({ intents });

const prefix = '!';

const participants = {};

const participantsFilePath = 'C:\\Users\\rickv\\Desktop\\Secret Santa Bot\\participants.json';

// Function to initialize the JSON file with an empty array
function initializeParticipantsFile() {
    fs.writeFileSync(participantsFilePath, '[]', 'utf8');
    console.log('Initialized participants.json with an empty array.');
}

// Call the function to initialize the JSON file at the beginning
initializeParticipantsFile();


// Define the ID of the channel where the !signup command should work
const signupChannelId = '1159147751855112192';

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    const startupChannel = client.channels.cache.get(signupChannelId);

    if (startupChannel) {
        // Send the startup message with the tutorial and rules
        startupChannel.send(`
        🎄🎅🎁 Welcome to Secret Santa! 🎄🎅🎁
        Let's spread some holiday cheer! Here's how to sign up and the festive rules:
    
        **How to Sign Up:**
        To join the Secret Santa, use the command \`!signup <trade link> <interest 1> <interest 2> <interest 3>\`
        Example: \`!signup https://steamcommunity.com/tradeoffer/new/?partner=1234567890 PashaBiceps Souvenirs Katowice2019\`
    
        **Rules:**
        🎁 Sign up with a valid trade link and 3 interests.
        🎁 Plan your gift with care! It should be approximately **$20 (145 RMB)**, and please keep it within 10% of this price (around $18 to $22).
        🎁 Send your heartwarming gift to your assigned recipient before December 25.
        🎁 Pairs will be magically revealed on **X (date)**.
    
        🎁🎉 Have fun, spread the joy, and happy gifting! 🎉🎁
        `);
    } else {
        console.error('Startup channel not found.');
    }


});

// Event: When a message is received
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Check if the message is sent in the specified channel
    if (message.channel.id !== signupChannelId) {
        return; // Ignore messages from other channels
    }

    // Split the message content into command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Command: !signup
    if (command === 'signup') {
        // Check if the user has already signed up
        if (participants[message.author.id]) {
            const replyMessage = await message.channel.send(`<@${message.author.id}> You have already signed up for Secret Santa. Your message will be deleted!`);
    
            // Delete the user's message to prevent flooding
            try {
                await message.delete();
            } catch (error) {
                console.error('Error deleting message:', error);
            }
    
            // Delete the bot's message after 5 seconds
            setTimeout(() => {
                replyMessage.delete().catch(console.error);
            }, 5000); // 5000 milliseconds (5 seconds)
            return;
        }
    
        // Extract trade link and interests from arguments
        const [tradelink, ...interests] = args;
    
        // Check if the required information is provided
        if (!tradelink || interests.length < 3) {
            message.channel.send(`<@${message.author.id}> Please provide a valid trade link and 3 interests.`);
            return;
        }
    
        // Function to extract SteamID64 from a Steam trade link
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
    
        // Extract SteamID64 from the provided trade link
        const steamID64 = extractSteamID64(tradelink);
    
        if (steamID64) {
            // Create a new participant object
            const newParticipant = {
                userId: message.author.id,
                name: message.author.username,
                tradelink,
                interests,
                steamID64: steamID64.toString(),
                assigned: null,
            };
    
            // Write the new participant's data to the JSON file
            fs.readFile("C:\\Users\\rickv\\Desktop\\Secret Santa Bot\\participants.json", 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading participants.json:', err);
                    return;
                }
    
                const participantsData = JSON.parse(data);
    
                // Add the new participant to the array
                participantsData.push(newParticipant);
    
                // Write the updated data back to the JSON file
                fs.writeFile("C:\\Users\\rickv\\Desktop\\Secret Santa Bot\\participants.json", JSON.stringify(participantsData), (err) => {
                    if (err) {
                        console.error('Error writing participants.json:', err);
                        return;
                    }
                    console.log('Participant added and saved to participants.json');
                });
            });
    
            await message.delete();
            message.channel.send(`<@${message.author.id}> You have successfully signed up for Secret Santa!`);
        } else {
            message.channel.send(`<@${message.author.id}> Please provide a valid Steam trade link.`);
        }
    }
    
    // Clears channel
    else if (command === 'clear') {
        // Check if the message sender is an administrator
        if (message.member.permissions.has('ADMINISTRATOR')) {
            // Fetch the last 100 messages in the channel and delete them
            message.channel.messages.fetch({ limit: 100 })
                .then(messages => {
                    message.channel.bulkDelete(messages);
                })
                .catch(console.error);
        } else {
            message.channel.send(`<@${message.author.id}>You do not have permission to use this command.`);
        }
    }


    else if (command === 'roll') {
        // Check if the message sender is an administrator
        if (message.member.permissions.has('ADMINISTRATOR')) {
            // Get the participants from participants.json
            fs.readFile(participantsFilePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading participants.json:', err);
                    return;
                }
    
                const participantsData = JSON.parse(data);
    
                // Get an array of user IDs and shuffle them
                const userIds = participantsData.map(participant => participant.userId);
                const shuffledUserIds = shuffleArray(userIds);
    
                // Initialize an array to store the assignments
                const assignments = [];
    
                // Loop through shuffled user IDs
                for (let i = 0; i < shuffledUserIds.length; i++) {
                    const senderId = shuffledUserIds[i];
                    // Find a recipient who is not the sender
                    let receiverId = senderId;
                    while (receiverId === senderId) {
                        receiverId = shuffledUserIds[Math.floor(Math.random() * shuffledUserIds.length)];
                    }
    
                    // Get recipient's information and sender's user object
                    const receiver = participantsData.find(participant => participant.userId === receiverId);
                    const senderUser = message.guild.members.cache.get(senderId);
    
                    // Create a string with recipient's interests
                    const interestsString = receiver.interests.length > 0
                        ? `Interests: ${receiver.interests.join(', ')}`
                        : 'No interests provided.';
    
                    // Send a private message to the sender with recipient's information
                    senderUser.send(`
    🎅🎁🌟 **Ho ho ho!** 🌟🎁🎅
    
    Your Secret Santa gift recipient:
    🎄 **Name:** ${receiver.name}
    🎁 **Trade Link:** ${receiver.tradelink}
    🎉 **Interests:** ${interestsString}
    
    🎁 Plan your gift with care! It should be approximately **$20 (145 RMB)**, and please keep it within 10% of this price (around $18 to $22).
    📅 Send your heartwarming gift to your assigned recipient before December 25.
    
    Spread joy and warmth this holiday season! 🎅🌟🎁
    `).catch(console.error);
    
                    // Update the assignment information in participantsData
                    const senderIndex = participantsData.findIndex(participant => participant.userId === senderId);
                    participantsData[senderIndex].assigned = receiverId;
    
                    // Store the assignment information
                    const assignment = {
                        receiverId: receiverId,
                    };
                    assignments.push(assignment);
                }
    
                // Update the assignments in the JSON file
                fs.writeFile(participantsFilePath, JSON.stringify(participantsData, null, 4), (err) => {
                    if (err) {
                        console.error('Error writing assignments to participants.json:', err);
                    } else {
                        console.log('Assignments updated in participants.json');
                    }
                });
    
                // Notify in the channel that pairs have been sent
                message.channel.send('Secret Santa pairs have been assigned and updated!');
            });
        } else {
            message.channel.send(`<@${message.author.id}> You do not have permission to use this command.`);
        }
    }
    
    
    

});

// Function to shuffle an array using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


client.login(process.env.DISCORD_TOKEN);
