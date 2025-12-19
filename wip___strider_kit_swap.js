const MACRO_NAME = "Strider Kit Swap"
const MACRO_VERSION = "0.1"

const OG_NAME_FLAG = `${MACRO_NAME}_ogName`;
const KITS_FLAG = `${MACRO_NAME}_kits`;
const CUR_KIT_FLAG = `${MACRO_NAME}_curKit`;

const SETTINGS = {
	CHANGE_TOKEN_NAME: true,

	DISPLAY_CHAT_MESSAGE: true,

	PLAY_FX: true
}

if (!token) {
	ui.notifications.error("Please select a token.");
    return;
}

const actorItems = actor.items;
if (actorItems.find(x => x.type == "npc_class" && x.name.toLowerCase().includes("strider")) == null) {
	ui.notifications.error("This macro only works on Strider NPCs!");
	return;
}

if (!actor.getFlag("world", OG_NAME_FLAG)) {
	ui.notifications.info("First run on this token detected. Populating data...");
	consoleLog(`Setting original name to ${token.name}...`);
    actor.setFlag("world", OG_NAME_FLAG, token.name);
	consoleLog("Populating kits...");
	let kits = {};
	for (const item of actorItems.filter(x => x.type == "npc_feature")) {
		if (!item._source.system.origin.name.toLowerCase().includes("strider"))
			continue;
		let itemName = item.name.toLowerCase();
		if (!itemName.includes("kit"))
			continue;
		if (itemName == "swap kit")
			continue;
		itemName = Array.from(itemName.matchAll(/(.*?)kit/gm), x => x[1]).toString();
		itemName = itemName.toLowerCase().replace(/(^|\s|\-)[a-z]/gi, l => l.toUpperCase()).trim();
		consoleLog(`Kit found: ${itemName}`);
		kits[itemName] = 1;
	}
	consoleLog("Detected kits are as follows:");
	console.log(kits);
	actor.setFlag("world", KITS_FLAG, kits);
	ui.notifications.info(`Data population complete. Detected ${Object.keys(kits).length} kit(s): ${Object.keys(kits).join(", ")}. Please run the macro again.`)
	return;
}

consoleLog("Reading flags...");
console.log(actor.getFlag("world", OG_NAME_FLAG));
console.log(actor.getFlag("world", KITS_FLAG));
const ogName = actor.getFlag("world", OG_NAME_FLAG);
const kits = actor.getFlag("world", KITS_FLAG);

let error = false;

if (ogName == undefined) {
	error = "Original name flag is undefined"
} else if (kits == undefined) {
	error = "Kits flag is undefined";
} else if (Object.keys(kits).length == 0) {
	error = "Kits flag has no values";
}

if (error != false) {
	ui.notifications.error(`Something went wrong: ${error}. Macro data has been cleared -- please try running it again.`)
	actor.unsetFlag("world", OG_NAME_FLAG);
	actor.unsetFlag("world", KITS_FLAG);
	return;
}

let kitBtns = Object.values(Object.keys(kits).reduce((acc, key) => {
	acc[key] = { action: key, label: key, callback: () => swapKit(key) };
	return acc;
}, {}))

new foundry.applications.api.DialogV2({
	window: { title: `${MACRO_NAME} ${MACRO_VERSION}` },
	content: `Please select a kit to switch to, or press Escape to cancel.`,
	buttons: kitBtns
}).render({ force: true });

async function swapKit(kitName) {
	if (actor.getFlag("world", CUR_KIT_FLAG) == kitName)
		return;
	actor.setFlag("world", CUR_KIT_FLAG, kitName);
	if (SETTINGS.CHANGE_TOKEN_NAME) {
		let newTokenName = `${ogName} (${kitName})`;
		await token.document.update({ "name": newTokenName });
		let combatant = game.combat?.combatants?.find(x => x.tokenId === token.id);
		if (combatant != null) {
			await combatant.update({ "name": newTokenName });
		}
	}
	if (SETTINGS.DISPLAY_CHAT_MESSAGE) {
		const classFeature = actorItems.find(x => x.type == "npc_feature" && x.name.toLowerCase().includes(`${kitName.toLowerCase()} kit`));
		if (classFeature != null) {
			await classFeature.beginSystemFlow();
		}
	}
}

function consoleLog(contents) {
	console.log(`[MACRO] ${MACRO_NAME} ${MACRO_VERSION} | ${contents}`)
}
