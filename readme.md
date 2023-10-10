# Secret Santa Bot

Welcome to the SteamBot project! This project consists of two main components: `SteamBot.js` and `Bot.js`. `SteamBot.js` handles Steam-related functionality, while `Bot.js` manages interactions within a Discord server. These components work together to create a Secret Santa event in your server. 

## SteamBot.js

### Dependencies

- `SteamUser`: For Steam client functionality.
- `SteamCommunity`: For Steam community interactions.
- `SteamTotp`: For generating Steam two-factor authentication codes.
- `TradeOfferManager`: For handling trade offers on Steam.
- `ToadScheduler` and `node-schedule`: For scheduling tasks.
- `fs`: For file system operations.
- `dotenv`: For loading environment variables.
- `Discord.js`: For Discord bot functionality.

### Features

- Handles Steam user login and game status.
- Manages Steam trade offers and sets up cookies.
- Periodically checks for new trade offers and automatically accepts certain offers.
- Logs events to a specified Discord channel.
- Reads and updates participant data in a JSON file.
- Schedules trade sending on December 25th.

## Bot.js

### Dependencies

- `Discord.js`: For Discord bot functionality.

### Features

- Provides a Discord bot for managing the Secret Santa event in your server.
- Sends welcome messages and event instructions when the bot starts.
- Allows users to sign up for the event by providing their Steam trade link and interests.
- Supports an administrator-only command for pairing participants.
- Handles errors and permissions gracefully.
- Shuffles participants for Secret Santa assignments.
- Sends private messages to participants with their assigned recipients' information.

## How to Use

1. Set up your Discord bot and get the bot token.
2. Create a `.env` file with the following environment variables:
   - `DISCORD_TOKEN`: Your Discord bot token.
   - `STEAMUSERNAME`: Your Steam username.
   - `PASSWORD`: Your Steam password.
   - `SHAREDSECRET`: Your Steam shared secret.
   - `IDENTITYSECRET`: Your Steam identity secret.
3. Install the required Node.js packages using `npm install`.
4. Run `SteamBot.js` and `Bot.js` separately in your Node.js environment.
5. Follow the instructions in your Discord server to participate in the Secret Santa event.

## Important Notes

- Ensure that your Steam account and trade link are correctly configured.
- Modify the Discord channel and event details to fit your server's needs.
- Be cautious with your Steam credentials and secrets, and do not share them publicly.

Enjoy your Secret Santa event, and happy gifting! 🎅🎁🌟
