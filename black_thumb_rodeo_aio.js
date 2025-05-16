/*
	Black Thumb Rodeo All-In-One
	Written by Ceres (@avawantstheoldusernamesback on Discord)

	Tested with a module-heavy setup on Foundry version 12.331, Lancer version 2.8.1.

	This macro attempts to automate Black Thumb Rodeo by placing a resized pilot token that (mostly) shares a space with the mech token itself.
	It's "all-in-one" -- that is to say, the same button can be used to enable and disable the rodeo without any kind of extra setup.

	Usage instructions: Select your mech and activate this macro to toggle on and off. You shouldn't need to change anything.
	* If your pilot token gets off-center, just activate the macro again. By default, it'll intelligently re-center the token instead of deleting it!

	Limitations:
	* For this macro to work, users MUST have the required permissions to create and delete tokens. It won't function otherwise.
	* Template weapons don't consider the pilot token and mech token to share a space. GMs may need to manually target the pilot token during area attacks.
	* Nothing attaches the pilot token to the mech token -- you'll need to select both tokens and move them together, or use a module to attach one to the other.
		* If the Token Attacher module is loaded, it will be automatically used to negate this issue! You can freely enable or disable this functionality in the settings.

	Notes:
	* By default, this macro intuits your Foundry user's assigned character as the pilot to use. You can change the settings to search for a sheet by name, if needed.
	* There's nothing saying you actually have to use a pilot for this macro. You'll need to change the settings, but you can use it for things like Latch Drone if you're a GM!

	Changelog:
	* 0.1: Initial public release. Works with Foundry v12.331, Lancer v2.8.1.
*/

// You can safely ignore this
const DUPLICATE_TOKEN_HANDLING = { SMART: 1, PROMPT: 2, RECENTER: 3, DELETE: 4, NONE: 5 }



/////////////////////////////////////////////////////////////
//                        SETTINGS                         //
//  Any of these variables can be changed to your liking.  //
/////////////////////////////////////////////////////////////



const SETTINGS = {
	// The macro will attempt to detect your pilot sheet automatically.
	// If you have issues with the default functionality, turn this to false and use PILOT_NAME below, instead.
	INTUIT_PILOT_SHEET: true,

	// This should match the name of the pilot exactly -- replace whatever's inside the quotes with the name of the character you want to use.
	// For most use, you shouldn't need to mess with this; if INTUIT_PILOT_SHEET is enabled, as it is by default, then the macro should find the right sheet automatically
	// (Unless you're a GM using this for things like Latch Drone, in which case go nuts)
	PILOT_NAME: "Paulie Placeholder",

	// Determines how the macro behaves when it detects that a pilot token has already been placed. Possible settings include SMART, PROMPT, RECENTER, DELETE, and NONE.
	// SMART is the default; it will re-center the token if it's out of position, and delete it if it's already in the right spot. This should be fine for all general use cases.
	EXISTING_TOKEN_HANDLING: DUPLICATE_TOKEN_HANDLING.SMART,

	// Show visible notifications for macro logic. If disabled, these will be silently outputted to the console instead.
	INFO_NOTIFICATIONS: false,

	// Determines the scale and offset of the attached token. Default values will keep the pilot token attached to the top-right of the host token.
	TOKEN_SCALE: { X: 0.55, Y: 0.55 },
	TOKEN_OFFSET: { X: canvas.scene.grid.size * 0.5, Y: canvas.scene.grid.size * 0.5 },

	// Module integrations!
	// These won't do anything if their requisite module isn't loaded -- they won't throw any errors, they'll just fail gracefully
	INTEGRATION_TOKEN_MAGIC_FX: true, // Applies a glow effect to the pilot token to make it more visible.
	INTEGRATION_TOKEN_ATTACHER: true // Attaches the pilot token to the mech token, allowing them to move together.
}



//////////////////////////////////
//                              //
//  MAIN FUNCTIONS BELOW HERE   //
//                              //
//////////////////////////////////



// Used in debug messaging 
const MACRO_NAME = "Black Thumb Rodeo AIO"
const MACRO_VERSION = "0.1"

// Module IDs, for optional integrations
const TOKEN_MAGIC_ID = "tokenmagic";
const TOKEN_ATTACHER_ID = "token-attacher";

const intuitedPilot = SETTINGS.INTUIT_PILOT_SHEET && game.user.character?.type === "pilot" ? game.user.character : undefined;
const pilotSheet = intuitedPilot ? intuitedPilot : await game.actors.find(i => i.name === SETTINGS.PILOT_NAME);

if (!SETTINGS.INTUIT_PILOT_SHEET && SETTINGS.PILOT_NAME === "Paulie Placeholder") {
	ui.notifications.error("You haven't set the name of your pilot sheet. Look for the settings section near the top of the macro code.");
	return;
}
if (!pilotSheet) {
	ui.notifications.error(`Couldn't locate a pilot sheet. Make sure that your pilot is set as your Foundry user's active character.
		If this problem persists, turn off INTUIT_PILOT_SHEET in the macro's settings and enter your pilot's name instead.`);
	return;
}
if (!token) {
	ui.notifications.error("Please select a token.");
	return;
}

try {
	let pilotName = intuitedPilot ? intuitedPilot.name : SETTINGS.PILOT_NAME;
	let placedToken = canvas.tokens.placeables.find(i => i.name === pilotName);

	// Assemble data for new token
	const newTokenData = await assembleTokenPlacementData(token);

	if (placedToken) {
		let newTask = SETTINGS.EXISTING_TOKEN_HANDLING;
		switch (newTask) {
			case DUPLICATE_TOKEN_HANDLING.NONE:
				notifInfo("Found existing pilot token. Macro terminated.");
				break;
			case DUPLICATE_TOKEN_HANDLING.PROMPT:
				await foundry.applications.api.DialogV2.wait({
					window: { title: `${MACRO_NAME} ${MACRO_VERSION}` },
					content: "Found an existing token. Re-center it, or delete it?",
					buttons: [
						{
							action: "recenter",
							label: "Re-center it",
							default: true,
							callback: () => newTask = DUPLICATE_TOKEN_HANDLING.RECENTER
						},
						{
							action: "delete",
							label: "Delete it",
							callback: () => newTask = DUPLICATE_TOKEN_HANDLING.DELETE
						}
					],
				});
				break;
			case DUPLICATE_TOKEN_HANDLING.SMART:
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
			if (SETTINGS.INTEGRATION_TOKEN_MAGIC_FX)
				await applyGlow(placedToken);
			notifInfo("Found existing token and re-centered it.");
		}
		return;
	}

	// Apply new data to pilot token, then create
	const pilotTokenDoc = await pilotSheet.getTokenDocument(newTokenData);
	await canvas.scene.createEmbeddedDocuments("Token", [pilotTokenDoc.toObject()]);

	// Finalize the placed token
	placedToken = canvas.tokens.placeables.find(i => i.name === pilotName);
	if (SETTINGS.INTEGRATION_TOKEN_MAGIC_FX)
		applyGlow(placedToken);
	if (SETTINGS.INTEGRATION_TOKEN_ATTACHER)
		attachToken(token, placedToken)
	notifInfo("Placed Black Thumb Rodeo token.");
} catch (error) {
	ui.notifications.error(`Error caught during during Black Thumb Rodeo macro, check your console for details -- ${error}`);
}



////////////////
//            //
//  HELPERS   //
//            //
////////////////



// Fetches display data to be provided to the pilot token.
// This accepts the mech's base token and then scales down the pilot based on that, as well as removing HP bars.
async function assembleTokenPlacementData(baseToken) {
	let data = baseToken.getSnappedPosition();
	data.x += SETTINGS.TOKEN_OFFSET.X;
	data.y -= SETTINGS.TOKEN_OFFSET.Y;
	data["texture.scaleX"] = SETTINGS.TOKEN_SCALE.X;
	data["texture.scaleY"] = SETTINGS.TOKEN_SCALE.Y;
	data["flags.barbrawl.resourceBars.bar1.attribute"] = "";
	data["flags.barbrawl.resourceBars.bar2.attribute"] = "";
	data["displayName"] = CONST.TOKEN_DISPLAY_MODES.HOVER;
	data["displayBars"] = 0;
	return data;
}

// Applies a glow effect to the pilot token to make it stand out.
// If Token Magic isn't loaded, this method will fail gracefully.
async function applyGlow(placedToken) {
	if (!game.modules.get(TOKEN_MAGIC_ID)?.active)
		return;
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
					val1: 0x5099DD,
					val2: 0x90EEFF
				}
			}
		}];
	await placedToken.TMFXaddUpdateFilters(params);
}

// Attempts to use Token Attacher to glue the pilot token to the mech token.
// If Token Attacher isn't loaded, this method will fail gracefully.
async function attachToken(mechToken, pilotToken) {
	if (!game.modules.get(TOKEN_ATTACHER_ID)?.active)
		return;
	await tokenAttacher.attachElementToToken(pilotToken, mechToken, true);
}

// Wrapper function for debug logging. Uses console.log(info) if notifications aren't enabled, and ui.notifications.info(info) if they are.
function notifInfo(info) {
	if (SETTINGS.INFO_NOTIFICATIONS)
		ui.notifications.info(info);
	else
		console.log(`[MACRO] ${MACRO_NAME} ${MACRO_VERSION} | ${info}`);
}
