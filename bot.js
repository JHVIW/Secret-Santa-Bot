import { config } from 'dotenv';
import Discord from 'discord.js';
config();

const { Client, Intents } = Discord;

const intents = new Intents([
  Intents.FLAGS.GUILDS,           // Required for basic information about servers
  Intents.FLAGS.GUILD_MESSAGES,   // Required for message-related events
]);

const client = new Client({ intents });

const prefix = '!';

const participants = {};

// Define the ID of the channel where the !signup command should work
const signupChannelId = '1159147751855112192'; // Replace with the actual channel ID

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
            message.channel.send(`<@${message.author.id}>Please provide a valid trade link and at least 3 interests.`);
            return;
        }

        // Store participant's information
        participants[message.author.id] = { name: message.author.username, tradelink, interests };
        await message.delete();
        message.channel.send(`<@${message.author.id}> You have successfully signed up for Secret Santa!`);
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
            // Get an array of user IDs and shuffle them
            const userIds = Object.keys(participants);

            // If there is only one participant, assign themself
            if (userIds.length === 1) {
                const participantId = userIds[0];
                const participant = participants[participantId];
                const participantUser = message.guild.members.cache.get(participantId);

                // Create a string with participant's interests
                const interestsString = participant.interests.length > 0
                    ? `Interests: ${participant.interests.join(', ')}`
                    : 'No interests provided.';

                // Send a private message to the participant with their own information
                participantUser.send(`
🎅🎁🌟 Ho ho ho! 🌟🎁🎅

Your Secret Santa gift recipient:
🎄 Name: ${participant.name}
🎁 Trade Link: ${participant.tradelink}
🎉 Interests: ${interestsString}

🎁 Plan your gift with care! It should be approximately **$20 (145 RMB)**, and please keep it within 10% of this price (around $18 to $22).
📅 Send your heartwarming gift to your assigned recipient before December 25.

Spread joy and warmth this holiday season! 🎅🌟🎁
`).catch(console.error);


                // Notify in the channel that pairs have been sent (for testing purposes)
                message.channel.send('Secret Santa pairs have been sent out (for testing purposes since there is only one user!)!');
            } else {
                // Get an array of user IDs and shuffle them
                const shuffledUserIds = shuffleArray(userIds);

                // Loop through shuffled user IDs
                for (let i = 0; i < shuffledUserIds.length; i++) {
                    const senderId = shuffledUserIds[i];
                    // Find a recipient who is not the sender
                    const receiverId = shuffledUserIds.find(id => id !== senderId);

                    // Handle case where no recipient is found
                    if (!receiverId) {
                        console.log('Unable to find a recipient for sender:', senderId);
                        continue;
                    }

                    // Get recipient's information and sender's user object
                    const receiver = participants[receiverId];
                    const senderUser = message.guild.members.cache.get(senderId);

                    // Create a string with recipient's interests
                    const interestsString = receiver.interests.length > 0
                        ? `Interests: ${receiver.interests.join(', ')}`
                        : 'No interests provided.';

                    // Send a private message to the sender with recipient's information
                    senderUser.send(`
                    🎅🎁🌟 Ho ho ho! 🌟🎁🎅

                    Your Secret Santa gift recipient:
                    🎄 Name: ${receiver.name}
                    🎁 Trade Link: ${receiver.tradelink}
                    🎉 Interests: ${interestsString}

                    🎁 Plan your gift with care! It should be approximately **$20 (145 RMB)**, and please keep it within 10% of this price (around $18 to $22).
                    📅 Send your heartwarming gift to your assigned recipient before December 25.

                    Spread joy and warmth this holiday season! 🎅🌟🎁
                `).catch(console.error);

                }

                // Notify in the channel that pairs have been sent (for testing purposes)
                message.channel.send('Secret Santa pairs have been sent out!');
            }
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
