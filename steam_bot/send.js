import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import TradeOfferManager from 'steam-tradeoffer-manager';
import { ToadScheduler } from 'toad-scheduler';
import schedule from 'node-schedule'
import fs from 'fs';

const participantsFilePath = 'C:\\Users\\rickv\\Desktop\\Secret Santa Bot\\participants.json';
let participantsData = [];

var username = "";
var password = "";
var sharedSecret = "";
var identitySecret = "";

let steam_client = new SteamUser();
let community = new SteamCommunity();
const scheduler = new ToadScheduler();
let manager = new TradeOfferManager({
    "pollInterval": 10000,
    "steam": steam_client,
    "domain": "localhost",
    "language": "en",
    "globalAssetCache": true,
});

var logOnOptions = {};
SteamTotp.getTimeOffset(function (err, offset, latency) {
    logOnOptions = {
        "accountName": username,
        "password": password,
        "twoFactorCode": SteamTotp.getAuthCode(sharedSecret, offset)
    };
    steam_client.logOn(logOnOptions);
});

steam_client.on('loggedOn', function () {
    steam_client.setPersona(SteamUser.EPersonaState.Online);
});

steam_client.on("webSession", (sessionID, cookies) => {
    manager.setCookies(cookies, (ERR) => { });
    community.setCookies(cookies);
    community.startConfirmationChecker(8000, identitySecret);
});

community.on('sessionExpired', function (err) {
    steam_client.webLogOn();
});

community.on("newConfirmation", (CONF) => {
    community.acceptConfirmationForObject(identitySecret, CONF.id, error);
});

fs.readFile(participantsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading participants.json:', err);
        return;
    }
    participantsData = JSON.parse(data);

    // Schedule the trade sending function on December 25th
    scheduleTradeSendingOnDecember25();
});

function scheduleTradeSendingOnDecember25() {
    // Schedule the trade sending function to run on December 25th
    const date = new Date(2023, 11, 25, 0, 0, 0); // December is 11 (0-indexed)
    schedule.scheduleJob(date, () => {
        console.log('Sending trades on December 25th...');

        // Iterate through participants to send trades
        participantsData.forEach(participant => {
            // Check if the participant has an assigned user and sent items
            if (participant.assigned && participant.sentItemAssetIDs && participant.sentItemAssetIDs.length > 0) {
                const recipient = participantsData.find(user => user.userId === participant.assigned);

                if (recipient && recipient.tradelink) {
                    // Create a trade offer
                    const trade = manager.createOffer(recipient.tradelink);

                    // Add sentItemAssetIDs to the trade
                    participant.sentItemAssetIDs.forEach(assetID => {
                        trade.addMyItem({ assetid: assetID });
                    });

                    // Send the trade offer
                    trade.send((err, status) => {
                        if (err) {
                            console.error('Error sending trade:', err);
                        } else {
                            console.log('Trade sent to', recipient.name);
                        }
                    });
                }
            }
        });
    });
}