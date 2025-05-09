/*
	Black Thumb Rodeo All-In-One
	Written by Ceres (@avawantstheoldusernamesback on Discord)

	Tested with a module-heavy setup on Foundry version 12.331, Lancer version 2.8.1.

	This macro attempts to automate Black Thumb Rodeo by placing a resized pilot token that (mostly) shares a space with the mech token itself.
	It's "all-in-one" -- that is to say, the same button can be used to enable and disable the rodeo without any kind of extra setup.


	Changelog:
	* 0.1: Initial public release. Works with Foundry v12.331, Lancer v2.8.1. Cleanliness refactoring, file formatting, lots of changes from internal version
*/

const DUPLICATE_TOKEN_HANDLING = { SMART: 1, PROMPT: 2, RECENTER: 3, DELETE: 4, NONE: 5 } // You can safely ignore this

const SETTINGS = {
	// This should match the name of the pilot exactly
	PILOT_NAME: "LAKSHMI Prime",
	
	// Determines how the macro behaves when it detects that a pilot token has already been placed. Possible settings include SMART, PROMPT, RECENTER, DELETE, and NONE.
	// SMART is the default; it will re-center the token if it's out of position, and delete it if it's already in the right spot. This should be fine for all general use cases.
	EXISTING_TOKEN_HANDLING: DUPLICATE_TOKEN_HANDLING.SMART,
	
	// If true, the UI will log as it goes. If false, it'll log errors only.
	INFO_NOTIFICATIONS: false
}



//////////////////////////////////
//                              //
//  MAIN FUNCTIONS BELOW HERE   //
//                              //
//////////////////////////////////



const pilotSheet = await game.actors.find(i => i.name === SETTINGS.PILOT_NAME);

if (!pilotSheet) {
	ui.notifications.error("Didn't find pilot sheet. Make sure you got the name right!");
	return;
}
if (!token) {
	ui.notifications.error("Please select a token.");
	return;
}

const offset = canvas.scene.grid.size * 0.5;
let placedToken = canvas.tokens.placeables.find(i => i.name === SETTINGS.PILOT_NAME);

// Assemble data for new token
const newTokenData = await assembleTokenPlacementData(token, offset);

if (placedToken) {
	let newTask = SETTINGS.EXISTING_TOKEN_HANDLING;
	switch (newTask) {
		case DUPLICATE_TOKEN_HANDLING.NONE:
			notifInfo("Found existing pilot token. Macro terminated.");
			break;
		case DUPLICATE_TOKEN_HANDLING.PROMPT:
			await Dialog.wait({
				title: `Black Thumb Rodeo`,
				content: "<p>Found an existing token. Re-center it, or delete it?</p>",
				buttons: {
					one: {
						label: "Re-center it",
						callback: () => newTask = DUPLICATE_TOKEN_HANDLING.RECENTER
					},
					two: {
						label: "Delete it",
						callback: () => newTask = DUPLICATE_TOKEN_HANDLING.DELETE
					}
				},
				default: "one"
			});
			break;
		case DUPLICATE_TOKEN_HANDLING.SMART:
			console.log(placedToken);
			console.log(newTokenData);
			if (Math.round(placedToken.transform.position.x) === Math.round(newTokenData.x) && Math.round(placedToken.transform.position.y) === Math.round(newTokenData.y)) {
				notifInfo("Smart detection found existing token in position, and will attempt to delete it.");
				newTask = DUPLICATE_TOKEN_HANDLING.DELETE;
			} else {
				notifInfo("Smart detection found existing token out of position, and will attempt to recenter it.");
				newTask = DUPLICATE_TOKEN_HANDLING.RECENTER;
			}
			break;
	}
	if (newTask === DUPLICATE_TOKEN_HANDLING.DELETE) {
		await placedToken.document.delete();
		notifInfo("Found existing token and deleted it.");
	} else {
		await placedToken.document.update(newTokenData);
		notifInfo("Found existing token and re-centered it.");
	}
	return;
}

// Apply new data to pilot token, then create
const pilotTokenDoc = await pilotSheet.getTokenDocument(newTokenData);
await canvas.scene.createEmbeddedDocuments("Token", [pilotTokenDoc.toObject()]); 

// Find the newly-placed token 
placedToken = canvas.tokens.placeables.find(i => i.name === SETTINGS.PILOT_NAME);

let params =
[{
    filterType: "glow",
    filterId: "blackThumbOutline",
    outerStrength: 4,
    innerStrength: 0,
    color: 0x5099DD,
    quality: 0.5,
    padding: 10,
    animated:
    {
        color: 
        {
           active: true, 
           loopDuration: 3000, 
           animType: "colorOscillation", 
           val1:0x5099DD, 
           val2:0x90EEFF
        }
    }
}];

// Finally, apply a visual effect
await placedToken.TMFXaddUpdateFilters(params);
notifInfo("Placed Black Thumb Rodeo token.");



////////////////
//            //
//  HELPERS   //
//            //
////////////////



// Fetches display data to be provided to the pilot token.
// This accepts the mech's base token and then scales down the pilot based on that, as well as removing HP bars.
async function assembleTokenPlacementData(baseToken, offset) {
	let data = baseToken.getSnappedPosition();
	data.x += offset;
	data.y -= offset;
	data["texture.scaleX"] = 0.55;
	data["texture.scaleY"] = 0.55;
	data["flags.barbrawl.resourceBars.bar1.attribute"] = "";
	data["displayBars"] = 0;
	return data;
}

function notifInfo(info) {
	if (SETTINGS.INFO_NOTIFICATIONS)
		ui.notifications.info(info);
}
