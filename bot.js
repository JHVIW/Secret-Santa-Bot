import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import Discord from 'discord.js';
const { Client, Intents } = Discord;

import * as utils from './utils.js';
import { sendTrades, setDiscordClient } from './steambot.js';
import SteamTotp from 'steam-totp';

const intents = new Intents([
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
]);

const client = new Client({ intents });

config();

const prefix = '!';

const signedUpUsers = [];

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

// Create the participants.json file path using the current directory
const participantsFilePath = path.join(currentDirectory, 'participants.json');

// Initialize the JSON file
utils.initializeParticipantsFile(participantsFilePath);

// Define the ID of the channel where the !signup command should work
const signupChannelId = '1159537369087750154';

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Set the Discord client for steambot.js
    setDiscordClient(client);
    
    const startupChannel = client.channels.cache.get(signupChannelId);
    const logChannelId = "1438169605163061289";
    const logChannel = client.channels.cache.get(logChannelId);

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
🎁 Send your heartwarming gift to the bot before **December 16th**! 
🎁 The bot will automatically send your gift to your assigned recipient on **December 25th**!
🎁 Pairs will be magically revealed on **November 11th**. This is also when you will receive the bot's tradelink!

🎁🎉 Have fun, spread the joy, and happy gifting! 🎉🎁

**MAKE SURE TO HAVE YOUR DM'S OPEN TO SERVER MEMBERS. You can find this in Settings > Privacy and Safety > Allow Direct Messages From Server Members**
        `);
    } else {
        console.error('Startup channel not found.');
    }
    
    if (logChannel) {
        // Send the guide message with instructions for both bots
        logChannel.send(`
🤖 **Secret Santa Bot Guide** 🤖

**bot.js Commands:**
\`!signup <trade link> <interest 1> <interest 2> <interest 3>\`
- Users sign up for Secret Santa with their trade link and 3 interests
- Example: \`!signup https://steamcommunity.com/tradeoffer/new/?partner=1234567890 PashaBiceps Souvenirs Katowice2019\`
- Only works in the designated signup channel

\`!rollsantabot\` (Admin only)
- Assigns Secret Santa pairs to all participants
- Sends DMs to each participant with their recipient's information
- Updates participants.json with assignments

\`!senditemsforsecretsanta\`
- Triggers the trade sending process
- Sends all collected gifts to their assigned recipients

\`!checksignups\`
- Shows all participants who have signed up
- Displays whether each participant has sent their items

\`!code\`
- Generates and displays the current 2FA code for the Steam account

**How it works:**
1. Users sign up using \`!signup\` in the signup channel
2. Admin runs \`!rollsantabot\` to assign pairs
3. Participants send their gifts to the Steam bot account
4. Admin runs \`!senditemsforsecretsanta\` to distribute all gifts to recipients

**Note:** The Steam bot automatically accepts incoming trade offers and logs them to this channel.
        `).catch(console.error);
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
        if (signedUpUsers.includes(message.author.id)) {
            const replyMessage = await message.channel.send(`<@${message.author.id}> You have already signed up for Secret Santa. Your message will be deleted!`);

            // Delete the user's message to prevent flooding
            try {
                await message.delete();
            } catch (error) {
                console.error('Error deleting message:', error);
            }

            setTimeout(() => {
                replyMessage.delete().catch(console.error);
            }, 5000);

            return;
        }

        // Extract trade link and interests from arguments
        const [tradelink, ...interests] = args;

        // Check if the required information is provided
        if (!tradelink || interests.length < 3) {
            // Send a message to the user
            const userMessage = await message.channel.send(`<@${message.author.id}> Please provide a valid trade link and 3 interests.`);

            // Delete the user's message and the bot's message after 5 seconds
            setTimeout(() => {
                message.delete().catch(console.error);
                userMessage.delete().catch(console.error);
            }, 3000); // 5000 milliseconds (5 seconds)
            return;
        }

        // Extract SteamID64 from the provided trade link
        const steamID64 = utils.extractSteamID64(tradelink);

        if (steamID64) {
            // Create a new participant object
            const newParticipant = {
                userId: message.author.id,
                name: message.author.username,
                tradelink,
                interests,
                steamID64: steamID64.toString(),
                assigned: null,
                sentItemClassIDs: [], // Initialize sentItemClassIDs as an empty array
            };

            // Write the new participant's data to the JSON file
            utils.readParticipantsFile(participantsFilePath, (err, participantsData) => {
                if (err) return;

                // Add the new participant to the array
                participantsData.push(newParticipant);

                // Write the updated data back to the JSON file
                utils.writeParticipantsFile(participantsFilePath, participantsData, (err) => {
                    if (err) return;
                    console.log('Participant added and saved to participants.json');
                });
            });

            signedUpUsers.push(message.author.id);
            await message.delete();
            message.channel.send(`<@${message.author.id}> You have successfully signed up for Secret Santa!`);
        } else {
            const userMessage = await message.channel.send(`<@${message.author.id}> Please provide a valid trade link and 3 interests.`);
            // Delete the user's message and the bot's message after 5 seconds
            setTimeout(() => {
                message.delete().catch(console.error);
                userMessage.delete().catch(console.error);
            }, 3000); // 5000 milliseconds (5 seconds)
            return;
        }
    }

    // Command: !rollsantabot
    else if (command === 'rollsantabot') {
        // Check if the message sender is an administrator
        if (message.member.permissions.has('ADMINISTRATOR')) {
            // Get the participants from participants.json
            utils.readParticipantsFile(participantsFilePath, (err, participantsData) => {
                if (err) return;

                // Assign participants
                const assignedParticipantsData = utils.assignParticipants(participantsData);

                // Send a private message to each sender with their recipient's information
                assignedParticipantsData.forEach(participant => {
                    const sender = participant;
                    const receiver = assignedParticipantsData.find(p => p.userId === participant.assigned);
                    const senderUser = message.guild.members.cache.get(sender.userId);

                    // Create a string with recipient's interests
                    const interestsString = receiver.interests.length > 0
                        ? `${receiver.interests.join(', ')}`
                        : 'No interests provided.';

                    // Send a private message to the sender with recipient's information
                    senderUser.send(`
🎅🎁🌟 **Ho ho ho!** 🌟🎁🎅

Your Secret Santa gift recipient:
🎄 **Name:** ${receiver.name}
🎁 **Trade Link: <${receiver.tradelink}>**
🎉 **Interests:** ${interestsString}

🎁 Plan your gift with care! It should be approximately **$20 (145 RMB)**, and please keep it within 10% of this price (around $18 to $22).
📅 Send your heartwarming gift to the bot before December 17th.

Spread joy and warmth this holiday season! 🎅🌟🎁
                    `).catch(console.error);
                });

                // Update the assignments in the JSON file
                utils.writeParticipantsFile(participantsFilePath, assignedParticipantsData, (err) => {
                    if (err) return;
                    console.log('Assignments updated in participants.json');
                });

                // Notify in the channel that pairs have been sent
                message.channel.send('Secret Santa pairs have been assigned and updated!');
            });
        } else {
            message.channel.send(`<@${message.author.id}> You do not have permission to use this command.`);
        }
    }

    // Command: !senditemsforsecretsanta
    else if (command === 'senditemsforsecretsanta') {
        utils.readParticipantsFile(participantsFilePath, (err, participantsData) => {
            if (err) return;

            // Trigger the trade sending process by calling the Steam bot's sendTrades function
            sendTrades();
            message.channel.send('All trades are being sent!');
        });
    }

    // Command: !checksignups
    else if (command === 'checksignups') {
        utils.readParticipantsFile(participantsFilePath, (err, participantsData) => {
            if (err) {
                message.channel.send('Error reading participants file.');
                return;
            }

            if (participantsData.length === 0) {
                message.channel.send('No participants have signed up yet.');
                return;
            }

            const participantInfo = participantsData.map(participant => {
                const hasSentItems = participant.sentItemClassIDs && participant.sentItemClassIDs.length > 0;
                return `${participant.name} - Items Sent: ${hasSentItems ? 'Yes' : 'No'}`;
            });
            const responseMessage = `Participants who have signed up:\n${participantInfo.join('\n')}`;
            message.channel.send(responseMessage);
        });
    }

    // Command: !code
    else if (command === 'code') {
        try {
            const sharedSecret = process.env.SHAREDSECRET;
            if (!sharedSecret) {
                message.reply('❌ Steam shared secret not configured.');
                return;
            }
            const code = SteamTotp.getAuthCode(sharedSecret);
            message.reply(`🔐 **2FA Code:** \`${code}\``);
        } catch (error) {
            message.reply('❌ Error generating 2FA code: ' + error.message);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
