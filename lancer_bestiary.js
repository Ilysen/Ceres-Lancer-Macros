/*
	Lancer Bestiary 0.1
	Written by Ceres (@avawantstheoldusernamesback on Discord)

	Tested with a module-heavy setup on Foundry version 12.331, Lancer version 2.8.1.

	This macro creates a comprehensive bestiary of all NPC classes and templates, each sorted into per-role folders, with base and optional features each listed.
	If Kai's NPC Rebakes are installed, they'll be separated into their own folders!


	Usage instructions: Just hit the button and confirm. The macro should do everything on its own.
	* If there are duplicate sheets, you will be prompted on whether or not you want to skip them or to replace them entirely.
	* To customize functionality, you may adjust the values inside of SETTINGS to your liking.

	Limitations:
	* There's currently no easy way for an LCP to flag a feature as both a system and as a quick tech. You'll need to reference the books for that. Sorry...

	Credits:
	* I drew extensively from the macro work of LostCarcosa and Z3nner (GitHub names) to make this, in some cases with ported code. I stand on your shoulders here; thank you.

	Changelog:
	* 0.1: Initial public release. Works with Foundry v12.331, Lancer v2.8.1. Cleanliness refactoring, file formatting, lots of changes from internal version
*/



/////////////////////////////////////////////////////////////
//                        SETTINGS                         //
//  Any of these variables can be changed to your liking.  //
/////////////////////////////////////////////////////////////



const SETTINGS = {
	// By default, weapons will simply display at the top of each feature list.
	// If this is set to true, then weapons will have their own sections, entirely separate from other features.
	SEPARATE_WEAPONS_FROM_FEATURES: false,

	// Sets the permission level of created bestiary entries (from CONST.DOCUMENT_OWNERSHIP_LEVELS, use NONE, LIMITED, OBSERVER, or OWNER).
	// If you want players to be able to read these, keep this as it is!
	PERMISSION_LEVEL: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,

	// Determines how entries will be named.
	// 1: Class or template name, all uppercase (i.e. "GOLIATH")
	// 2: Class or template name, treated as a proper noun (i.e. "Industrial Mech")
	// 3: As-is. Note that this can result in mismatched styles from different LCPs!
	NAME_MODE: 2,

	// As `NAME_MODE`, but for the names of features and weapons rather than for page titles.
	// Many features aren't named like proper nouns (i.e. "Strike and Fade"), so we default to just using the LCP's version for these;
	// some potential inconsistency is less big of a deal with the feature names than it is with the entry names
	FEATURE_MODE: 3,

	// The name of the folder that bestiary entries will be sorted into.
	JOURNAL_FOLDER_NAME: "Bestiary",

	// Compatibility with Kai's NPC rebakes. These will be placed in a separate folder, for ease of understanding.
	// If you're not using those rebakes, you don't need to mess with this; the macro will detect it and handle things gracefully.
	// If you want to sort rebakes alongside regular entries, just make sure this has the same value as JOURNAL_FOLDER_NAME.
	REBAKE_FOLDER_NAME: "Bestiary (Rebakes)",

	// This is the substring used to identify a rebaked entry, as compared to a regular entry. You shouldn't need to change this.
	REBAKE_PREFIX: "[k]",

	// If true, the rebake prefix will be removed when creating entries.
	// For example, the rebake class "Assault [k]" will just be listed as "Assault".
	// This shouldn't cause issues with the core NPCs (it's just off by default for clarity) but it can be turned off if you prefer!
	REMOVE_REBAKE_PREFIX: false,

	// Some content needs hardcoded exceptions in order to be properly sorted and named. These are as follows:
	// 1. The RPV template (always capitalized, regardless of `NAME_MODE`)
	// 2. Grunts from Kai's rebakes (items are considered rebakes if they have `"Grunt "` in their names; note the whitespace the end)
	// If either of those causes you trouble, set this to false and these special exceptions will be ignored
	ENABLE_HACKY_WORKAROUNDS: true
}



///////////////////////////////////////////////////////////////////////////////////////
//                                                                                   //
//                        !! MACRO LOGIC BEYOND THIS POINT !!                        //
//  !! DON'T CHANGE ANYTHING BELOW THIS HEADER UNLESS YOU KNOW WHAT YOU'RE DOING !!  //
//                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////


// Used in 
const MACRO_NAME = "Lancer Bestiary"
const MACRO_VERSION = "0.1"

const DUPLICATE_HANDLING = { OVERWRITE: 1, SKIP: 2 } // These are defined in order to avoid using magic strings/numbers

if (await Dialog.confirm({
	title: `Lancer Bestiary ${MACRO_VERSION}`,
	content: '<p>Are you sure you want to regenerate the bestiary? This <b>cannot be interrupted</b> and will take a while.</p>'
}) != true)
	return;

//#region Main logic

//////////////////
//              //
//  MAIN LOGIC  //
//              //
//////////////////

// Warning: Here be dragons. This is about half-refactored from the much messier form it took (originally this was a private macro for personal use).
// I've done my best to make it palatable, but consider yourself warned!

let currentActivity = "Prepping basic data";
let currentSubActivity = "Stuff";
try {
	ui.notifications.info("Now regenerating the bestiary from class and template compendiums. This will take some time.");

	const pack = game.packs.get("world.npc-items");
	const docs = await pack.getDocuments();

	let fld = game.folders.getName(SETTINGS.JOURNAL_FOLDER_NAME);
	if (!fld && SETTINGS.JOURNAL_FOLDER_NAME.length > 0) {
		try {
			fld = await Folder.create({ "name": SETTINGS.JOURNAL_FOLDER_NAME, "type": "JournalEntry" });
		} catch (error) {
			ui.notifications.error(`Caught an error attempting to create folder ${SETTINGS.JOURNAL_FOLDER_NAME}! Try making the folder manually and running the macro again.`);
			return;
		}
	}

	const totalClasses = docs.filter(x => x.type === "npc_class").length;
	const totalTemplates = docs.filter(x => x.type === "npc_template").length;
	const totalEntries = totalClasses + totalTemplates;

	let rebakeFld = game.folders.getName(SETTINGS.REBAKE_FOLDER_NAME); // A reference to the folder used for rebakes, if applicable
	let totalProgress = 0; // The total number of operations run so far
	let duplicateBehavior = undefined; // Behavior used when encountering duplicate sheets. This is set via user input, and only if it's needed.

	// These should be self-explanatory:
	let totalRegeneratedClasses = 0;
	let totalRegeneratedTemplates = 0;
	let totalNewClasses = 0;
	let totalNewTemplates = 0;

	stage = "Building entries"
	for (let doc of docs.filter(x => x.type != "npc_feature")) {
		currentSubActivity = `"${doc.name}, getting basic data"`
		let entryName = processText(doc.name, SETTINGS.NAME_MODE);
		let isTemplate = doc.type === "npc_template";

		currentSubActivity = `"${doc.name}, checking for rebake"`
		// So, Kai's rebake includes bespoke grunt types.
		// Unfortunately, the system doesn't keep track of each entry's source LCP; once it's in the shared compendium, that data is lost
		// These don't have the standard [k] in their name. So, as a result, we just work around it by manually checking for "Grunt "
		// You may be asking : what if there's something from another LCP that has Grunt in the name?
		// Good question!
		let isRebake = entryName.includes(SETTINGS.REBAKE_PREFIX) || (SETTINGS.ENABLE_HACKY_WORKAROUNDS && entryName.includes("Grunt "));
		// Before we move on, make sure that the rebake folder is set up if we needed it
		if (isRebake && rebakeFld === undefined) {
			currentSubActivity = `"${doc.name}, building new rebake folder"`
			let newFld = await setupForRebakes();
			if (newFld === undefined) {
				ui.notifications.error("Encountered an error setting up for rebakes. Please report this.");
				return;
			}
			rebakeFld = newFld;
		}

		currentSubActivity = `"${doc.name}, beginning data construction"`
		let parentFld = isRebake ? rebakeFld : fld; // The parent folder the new entry will be stored in
		let infoContent; // Info about this entry, pulled from its tactics section (for classes) or its description (for templates)
		let fullHtml = ""; // This will eventually become the full content for the new journal entry!

		// Begin constructing our data
		totalProgress++;
		updateProgressBar(`Generating entry ${entryName}... (${totalProgress}/${totalEntries})`, totalProgress, totalEntries);
		if (!isTemplate) {
			consoleLog("Creating a sheet for NPC class named " + entryName + "... (" + totalNewClasses + "/" + totalClasses + ")");
			infoContent = doc.system.tactics;
			fullHtml = await assembleClassData(doc.system);
		} else {
			consoleLog("Creating a sheet for NPC template named " + entryName + "... (" + totalNewTemplates + "/" + totalTemplates + ")");
			infoContent = doc.system.description.replace("<br>", "<br><br>");
		}

		currentSubActivity = `"${doc.name}, checking for folders and existing entries"`
		// Determine appropriate subfolder. Classes will be sorted according to role (i.e. artillery, striker), while templates have their own
		let roleFolderName = processText(doc.system.role ? doc.system.role : "TEMPLATE", SETTINGS.NAME_MODE);
		let subfolder = parentFld.children.find(x => x.folder.name === roleFolderName)?.folder;
		if (!subfolder) {
			subfolder = await Folder.create({ name: roleFolderName, type: "JournalEntry", folder: parentFld });
		}
		let destinationFolder = subfolder ? subfolder : parentFld;

		if (isRebake && SETTINGS.REMOVE_REBAKE_PREFIX)
			entryName = entryName.replace(SETTINGS.REBAKE_PREFIX, "");
		let existingEntry = destinationFolder.contents.find(x => x.name === entryName);
		if (existingEntry) { // We've found a duplicate. Determine how to handle it for this run
			currentSubActivity = `"${doc.name}, handling duplicate entry"`
			if (duplicateBehavior === undefined) {
				await Dialog.wait({
					title: `Lancer Bestiary ${MACRO_VERSION}`,
					content: "<p>Found a duplicate bestiary sheet with the same name (" + entryName + "). Should we skip over entries that already have sheets, or overwrite them? <b>Overwriting will delete the duplicate entries and replace them with new ones.</b></p>",
					buttons: {
						one: {
							label: "Skip",
							callback: () => duplicateBehavior = DUPLICATE_HANDLING.SKIP
						},
						two: {
							label: "Overwrite",
							callback: () => duplicateBehavior = DUPLICATE_HANDLING.OVERWRITE
						}
					},
					default: "one"
				});
			}
			switch (duplicateBehavior) {
				case DUPLICATE_HANDLING.OVERWRITE:
					consoleLog("There's already a sheet named " + entryName + ", so we're deleting it in order to regenerate it.");
					existingEntry.delete();
					if (isTemplate)
						totalRegeneratedTemplates++;
					else
						totalRegeneratedClasses++;
					break;
				case DUPLICATE_HANDLING.SKIP:
					consoleLog("There's already a sheet named " + entryName + ", so we're skipping to the next entry instead.");
					continue;
			}
		}

		currentSubActivity = `"${doc.name}, building base features and weapons"`
		let baseFeatures = [], baseWeapons = [];
		for (const x of doc.system.base_features) {
			let feature = await game.lancer.fromLid(x);
			if (!feature) {
				consoleLog("Encountered an issue with feature by the name of " + x + ". Fix me manually?");
				continue;
			}
			if (feature.system.type === "Weapon")
				baseWeapons.push(feature.system);
			else
				baseFeatures.push(feature.system);
		};

		currentSubActivity = `"${doc.name}, building optional features and weapons"`
		let optionalFeatures = [], optionalWeapons = [];
		for (const x of doc.system.optional_features) {
			let feature = await game.lancer.fromLid(x);
			if (!feature) {
				consoleLog("Encountered an issue with feature by the name of " + x + ". Fix me manually?");
				continue;
			}
			if (feature.system.type === "Weapon")
				optionalWeapons.push(feature.system);
			else
				optionalFeatures.push(feature.system);
		};

		currentSubActivity = `"${doc.name}, constructing base weapons HTML"`
		let baseWeaponsContent = subConstructEntryWeapons(baseWeapons);
		currentSubActivity = `"${doc.name}, constructing optional weapons HTML"`
		let optionalWeaponsContent = subConstructEntryWeapons(optionalWeapons);
		currentSubActivity = `"${doc.name}, constructing base systems HTML"`
		let baseFeaturesContent = subConstructEntryFeatures(baseFeatures);
		currentSubActivity = `"${doc.name}, constructing optional systems HTML"`
		let optionalFeaturesContent = subConstructEntryFeatures(optionalFeatures);

		currentSubActivity = `"${doc.name}, assembling collected HTML"`
		if (infoContent)
			fullHtml += `<h3>Info</h3>` + infoContent;
		if (SETTINGS.SEPARATE_WEAPONS_FROM_FEATURES) {
			if (baseWeaponsContent)
				fullHtml += `<h3>Base Weapons</h3>` + baseWeaponsContent;
			if (baseFeaturesContent)
				fullHtml += `<h3>Base Features</h3>` + baseFeaturesContent
			if (optionalFeaturesContent)
				fullHtml += `<h3>Optional Features</h3>` + optionalFeaturesContent;
			if (optionalWeaponsContent) {
				fullHtml += "<h3>Optional Weapons</h3>" + optionalWeaponsContent;
			}
		} else {
			if (baseFeaturesContent)
				fullHtml += `<h3>Base Features</h3>` + baseWeaponsContent + baseFeaturesContent
			if (optionalFeaturesContent)
				fullHtml += `<h3>Optional Features</h3>` + optionalWeaponsContent + optionalFeaturesContent;
		}
		fullHtml += "</div>"

		currentSubActivity = `"${doc.name}, creating journal entry`
		let bestiaryJournalEntry;
		let bestiaryJournalPage = new JournalEntryPage({
			name: entryName,
			title: { show: false },
			type: "text",
			text: { content: fullHtml },
		});
		bestiaryJournalEntry = await JournalEntry.create({
			folder: destinationFolder.id,
			name: entryName,
		});
		bestiaryJournalEntry.createEmbeddedDocuments("JournalEntryPage", [bestiaryJournalPage]);
		bestiaryJournalEntry.update({ ownership: { default: SETTINGS.PERMISSION_LEVEL } });

		if (isTemplate)
			totalNewTemplates++;
		else
			totalNewClasses++;
	}

	ui.notifications.info(`Bestiary regeneration complete! Created ${totalNewClasses - totalRegeneratedClasses} class entries (${totalRegeneratedClasses} regenerated) and ${totalNewTemplates - totalRegeneratedTemplates} templates (${totalRegeneratedTemplates} regenerated).`);
	updateProgressBar("Bestiary regenerated.", totalEntries, totalEntries);
}
catch (error) {
	ui.notifications.error(`Error caught during bestiary generation at step ${currentActivity} (sub-activity ${currentSubActivity}), check your console for details -- ${error}`);
	updateProgressBar("Bestiary errored, stopping.", 100, 100);
}

//#endregion

//#region HTML functions

//////////////////////
//                  //
//  HTML FUNCTIONS  //
//                  //
//////////////////////

// Sets up a baseline set of data for the provided class.
async function assembleClassData(classItem) {
	let content = await subConstructHaseTable(classItem) + subConstructStatTable(classItem) + `</div><div style="color: #000000; width: 100%; float: right; text-align: left;">`;
	return content;
}

// Returns HTML for the provided class item including an image and its HASE data.
async function subConstructHaseTable(classItem) {
	// Fetch an appropriate Retrograde icon if possible by referencing the class's name, removing rebake suffix if needed
	let imgPath = `systems/lancer/assets/retrograde-minis/Retrograde-Minis-Corpro-${classItem.parent.name.toUpperCase()}.png`.replace(` ${SETTINGS.REBAKE_PREFIX.toUpperCase()}`, "");
	if (!await srcExists(imgPath)) {
		console.error(`Found no image file for ${classItem.parent.name}; this message is harmless`);
		imgPath = "systems/lancer/assets/icons/npc_class.svg";
	}
	let content = ``;
	// On the left-hand side, add an image...
	content += `<p><img style="border: 3px dashed #000000; float: left; margin-right: 5px; margin-left: 5px;" src="${imgPath}" width="30%" height="30%" /></p>`;
	// ...start a div with aligned text, to be closed later down the line...
	content += `<div style="color: #000000; width: 65%; float: right; text-align: left;">`
	// ...and finally add the HASE table to the right
	content +=
		`
    <table>
        <tr>
            <th>HULL</th>
						<th>AGI</th>
						<th>SYS</th>
						<th>ENG</th>
        </tr>
        <tr>
            <td>${(getStatString(classItem, "hull"))}</td>
						<td>${(getStatString(classItem, "agi"))}</td>
						<td>${(getStatString(classItem, "sys"))}</td>
						<td>${(getStatString(classItem, "eng"))}</td>
        </tr>
    </table>
    `
	return content;
}

// Returns HTML for the provided class item including all of its stats.
function subConstructStatTable(classItem) {
	let content = `
    <table>
        <tr>
            <th>Armor</th><th>HP</th><th>Heat Cap</th><th>Speed</th>
        </tr>
        <tr>
            <td>${getStatString(classItem, "armor")}</td><td>${getStatString(classItem, "hp")}</td><td>${getStatString(classItem, "heatcap")}</td><td>${getStatString(classItem, "speed")}</td>
        </tr>
        <tr>
            <th>Evasion</th><th>E-Def</th><th>Save</th><th>Sensors</th>
        </tr>
        <tr>
            <td>${getStatString(classItem, "evasion")}</td><td>${getStatString(classItem, "edef")}</td><td>${getStatString(classItem, "save")}</td><td>${getStatString(classItem, "sensor_range")}</td>
        </tr>
        <tr>
            <th>Size</th>
        </tr>
        <tr>
            <td>${joinArrayOrGetUnifiedValue(classItem.base_stats[0].size, " or ")}</td>
        </tr>
    </table>
    `
	return content;
}

// Returns HTML for every weapon entry in the provided object.
function subConstructEntryWeapons(weaponFeatures) {
	let weaponsContent = "";
	weaponFeatures.forEach(x => {
		weaponsContent += `<table>${constructWeaponHTML(x)}</table>`
	})
	return weaponsContent;
}

// Constructs HTML for the provided feature `feature`.
// Features encapsulate a much broader scope than weapons, so we need to account for lots of different possibilities.
function constructFeatureHTML(feature) {
	let featureDescription = ``;

	if (feature.trigger) // Reaction -- display trigger followed by description
		featureDescription = `<b>Trigger:</b> ${feature.trigger}<br><b>Effect:</b> ${feature.effect}`;
	else if (feature.effect) { // Standard feature -- just list description
		featureDescription = feature.effect;
	} else { // Nothing listed, oops
		featureDescription = "<i>No description provided.</i>";
	}

	let attackData = []; // Some features can be used to make attacks. This array tracks any kind of attack bonuses, accuracy, and difficulty
	if (feature.attack_bonus.length > 0) {
		let accBonus = joinArrayOrGetUnifiedValue(feature.attack_bonus);
		if (accBonus != "0") {
			attackData.push(`+${accBonus} ATTACK`)
		}
	}
	if (feature.accuracy[0]) {
		if (feature.accuracy[0] > 0) {
			attackData.push(`+${joinArrayOrGetUnifiedValue(feature.accuracy, "/+")} ACCURACY`)
		} else {
			attackData.push(`${joinArrayOrGetUnifiedValue(feature.accuracy, "/-")} DIFFICULTY`);
		}
	}

	let tagsText = []; // An array for this system's tags, made human-legible across different tiers
	if (feature.tags.length > 0) {
		feature.tags.forEach((t) => {
			tagsText.push(processTag(t));
		});
	};

	let finalData = `<details><summary>${processText(feature.parent.name, SETTINGS.FEATURE_MODE)}</summary>`;
	if (attackData.length > 0) {
		finalData += `<p>${attackData.join(", ")}</p>`
	}
	finalData += `<p>${featureDescription}</p>`;
	if (tagsText.length > 0) {
		finalData += `<p><i>Tags:</i> ${tagsText.join(", ")}</p>`
	}
	finalData += "</details>"
	return finalData;
}

// Constructs HTML for the provided weapon `weapon`.
function constructWeaponHTML(weapon) {
	let weaponName = "";
	let weaponDesc = "";
	let weaponEntry = "";
	let weaponRange = "";
	let weaponDamage = "";
	let weaponAccuracy = "";
	weaponName = `<tr><td><b>${processText(weapon.parent.name, SETTINGS.FEATURE_MODE)}</b></td></tr>`;
	weaponEntry += weaponName;
	weaponDesc += `<tr><td>+${joinArrayOrGetUnifiedValue(weapon.attack_bonus, "/+")} ATTACK</td>`
	if (weapon.accuracy[0]) {
		if (weapon.accuracy[0] > 0) {
			weaponAccuracy = `+${joinArrayOrGetUnifiedValue(weapon.accuracy, "/+")} ACCURACY`
		} else {
			weaponAccuracy = `${joinArrayOrGetUnifiedValue(weapon.accuracy, "/-")} DIFFICULTY`
		}
	}
	if (weaponAccuracy)
		weaponDesc += `<td>${weaponAccuracy}</td>`;
	if (weapon.range.length > 0) {
		weapon.range.forEach(r => weaponRange += r.type + ' ' + r.val + '&nbsp&nbsp&nbsp')
	};
	weaponDesc += `<td>${weaponRange}</td>`;
	if (weapon.damage.length > 0 && weapon.damage[0].length > 0) {
		let damageTypes = {};
		damageTypes["Kinetic"] = [];
		damageTypes["Energy"] = [];
		damageTypes["Explosive"] = [];
		damageTypes["Burn"] = [];
		damageTypes["Heat"] = [];
		damageTypes["Variable"] = [];
		weapon.damage.forEach(d => {
			damageTypes[d[0].type].push(d[0].val);
		});
		weaponDamage += "<td>"
		Object.keys(damageTypes).forEach(dt => {
			if (damageTypes[dt].length > 0) {
				weaponDamage += `${joinArrayOrGetUnifiedValue(damageTypes[dt])} ${dt}`;
			}
		});
		weaponDamage += "&nbsp&nbsp&nbsp</td>"
	};
	weaponDesc += `<td>${weaponDamage}</td>`;
	if (weapon.uses.max < 0)
		weaponDesc += `<td>USES: ${weapon.uses.max}</td>`
	weaponDesc += "<tr>";
	if (weapon.trigger) {
		weaponDesc += `<tr><td colspan="6"><details><summary>Trigger</summary><p>${weapon.trigger}</p></details></td></tr>`;
	};
	if (weapon.effect) {
		weaponDesc += `<tr><td colspan="6">${weapon.effect}</td></tr>`;
	};
	if (weapon.on_hit) {
		weaponDesc += `<tr><td colspan="6"><b>On Hit:</b> ${weapon.on_hit}</td></tr>`;
	};
	if (weapon.tags.length > 0) {
		let tagsList = [];
		weapon.tags.forEach((t, index) => {
			tagsList.push(processTag(t));
		});
		weaponDesc += `<tr><td colspan="6"><i>Tags:</i> ${tagsList.join(", ")}</td></tr>`;
	};
	weaponEntry += weaponDesc;
	return weaponEntry;
}

// Returns HTML for every feature entry in the provided object.
function subConstructEntryFeatures(featureList) {
	let sc_list = ``;
	featureList.forEach(i => {
		sc_list += constructFeatureHTML(i);
	});
	return sc_list
}

//#endregion

//#region Helper functions

////////////////////////
//                    //
//  HELPER FUNCTIONS  //
//                    //
////////////////////////

function consoleLog(contents) {
	console.log(`Macro: ${MACRO_NAME} ${MACRO_VERSION} | ${contents}`)
}

// Returns a human-readable version of `baseName`, with specifics depending on the provided `mode`.
// LCPs often use conflicting standards for how they name their stuff; this lets us use a unified presentation for all of them.
function processText(baseName, mode) {
	// This whole macro should only ever be run once or twice, so we can get away with some inefficiencies here :bleh:
	if (SETTINGS.ENABLE_HACKY_WORKAROUNDS && baseName === "RPV")
		return baseName.toUpperCase();
	switch (mode) {
		case 1: // Capitalize
			return baseName.toUpperCase();
		case 2: // Proper noun. Accounts for spaces and hypens (i.e. "SELF-ERASURE" -> "Self-Erasure")
			return baseName.toLowerCase().replace(/(^|\s|\-)[a-z]/gi, l => l.toUpperCase());
		case 3: // As-is
			return baseName;
	}
}

// Returns a human-readable version of `tag`, with enclosing brackets removed.
// For instance, a tag whose name is "Reliable" and whose value is "{1/2/3}" will return "Reliable 1/2/3".
function processTag(tag) {
	let tagText = tag.name.replace("{VAL}", tag.val);
	tagText = tagText.replace("{", "");
	tagText = tagText.replace("}", "");
	return tagText;
}

// Checks the provided `classItem` for any stat named `keyString` and then returns a human-readable string to represent its value across different tiers.
function getStatString(classItem, keyString) {
	let statsPerTier = [];
	classItem.base_stats.forEach(x => {
		statsPerTier.push(x[keyString]);
	});
	return joinArrayOrGetUnifiedValue(statsPerTier);
}

// If every value in the provided array is identical, returns that value. Otherwise, returns a joined array.
// For example: [ "1", "1", "1" ] would just return "1", but [ "1", "2", "3" ] would return "1/2/3".
function joinArrayOrGetUnifiedValue(array, joinKey = "/") {
	if (!Array.isArray(array))
		return array;
	if (array.every(val => val === array[0]))
		return array[0];
	return array.join(joinKey);
}

// Updates Foundry's built-in progress bar using the provided data to provide a visual representation of the macro's progress.
// If `progress` === `total`, the bar will be faded out.
function updateProgressBar(context, progress, total) {
	const loader = document.getElementById("loading");
	loader.querySelector("#context").textContent = context;
	loader.querySelector("#loading-bar").style.width = `${Math.round((progress / total) * 100)}%`;
	loader.querySelector("#progress").textContent = `${Math.round((progress / total) * 100)}%`;
	loader.style.display = "block";
	if ((progress === total) && !loader.hidden)
		$(loader).fadeOut(2000);
}

// Attempts to set up and create a secondary bestiary folder for rebakes. This is only run if it's actually needed.
async function setupForRebakes() {
	rebakeFld = game.folders.getName(SETTINGS.REBAKE_FOLDER_NAME);
	if (!rebakeFld && SETTINGS.REBAKE_FOLDER_NAME.length > 0) {
		try {
			rebakeFld = await Folder.create({ "name": SETTINGS.REBAKE_FOLDER_NAME, "type": "JournalEntry" });
			return rebakeFld;
		} catch (error) {
			ui.notifications.error(`${SETTINGS.REBAKE_FOLDER_NAME} does not exist and must be created manually by a user with permissions to do so.`);
			return;
		}
	}
}

//#endregion
