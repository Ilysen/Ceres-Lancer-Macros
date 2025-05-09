const SETTINGS = {
	PILOT_NAME: "LAKSHMI Prime" // This should match the name of the pilot exactly
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
const buppyDoc = await pilotSheet.getTokenDocument();

// Assemble data for new token
const newTokenData = token.getSnappedPosition();
newTokenData.x += offset;
newTokenData.y -= offset;
newTokenData["texture.scaleX"] = 0.55;
newTokenData["texture.scaleY"] = 0.55;
newTokenData["flags.barbrawl.resourceBars"] = null;
newTokenData["displayBars"] = 0;

// Apply new data to pilot token, then create
const pilotTokenDoc = await pilotSheet.getTokenDocument(newTokenData);
await canvas.scene.createEmbeddedDocuments("Token", [pilotTokenDoc.toObject()]); 

// Find the newly-placed token 
const placedToken = canvas.tokens.placeables.find(i => i.name === SETTINGS.PILOT_NAME);
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

await placedToken.TMFXaddUpdateFilters(params);
