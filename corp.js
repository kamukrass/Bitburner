/** @param {NS} ns **/
export async function main(ns) {

	const productCity = "Sector-12";

	if (!ns.getPlayer().hasCorporation) {
		ns.corporation.createCorporation("MyCorp");
	}
	var corp = ns.corporation.getCorporation();
	if (corp.divisions.length < 1) {
		// initial Software Company setup
		initialSetup(ns, "Software");
		corp = ns.corporation.getCorporation();
		await initSoftwareCities(ns, corp.divisions[0]);
		await createFirstSoftware(ns, corp.divisions[0], productCity);
	}

}

function initialSetup(ns, division) {
	ns.corporation.expandIndustry(division, division);
	ns.corporation.unlockUpgrade("Smart Supply");
}

async function initSoftwareCities(ns, division) {
	for (const city of cities) {
		ns.tprint("Expand City " + city + " division " + division.name);
		if (!division.cities.includes(city)) {
			ns.corporation.expandCity(division.name, city);
			ns.corporation.purchaseWarehouse(division.name, city);
		}

		ns.corporation.setSmartSupply(division.name, city, true);

		// setup office
		for (var i = 0; i < 3; i++) {
			await ns.corporation.hireEmployee(division.name, city);
		}
		await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", 1);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 1);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", 1);

		ns.corporation.sellMaterial(division.name, city, "AI Cores", "MAX", "MP");
		ns.corporation.upgradeWarehouse(division.name, city);
	}
}

async function createFirstSoftware(ns, division, city) {

	ns.tprint("unlock upgrades");


	ns.corporation.levelUpgrade("Smart Factories");
	ns.corporation.levelUpgrade("Smart Storage");
	ns.corporation.levelUpgrade("DreamSense");
	ns.corporation.levelUpgrade("Wilson Analytics");
	for (var i = 0; i < 2; i++) {
		// upgrade employee stats
		ns.corporation.levelUpgrade("Nuoptimal Nootropic Injector Implants");
		ns.corporation.levelUpgrade("Speech Processor Implants");
		ns.corporation.levelUpgrade("Neural Accelerators");
		ns.corporation.levelUpgrade("FocusWires");
	}

	const newEmployees = 6;
	ns.corporation.upgradeOfficeSize(corp.divisions[0].name, "Sector-12", newEmployees);
	for (var i = 0; i < newEmployees; i++) {
		await ns.corporation.hireEmployee(division.name, city);
	}
	await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 4);
	await ns.corporation.setAutoJobAssignment(division.name, city, "Management", 1);
	await ns.corporation.setAutoJobAssignment(division.name, city, "Training", 1);

    ns.corporation.makeProduct(division.name, city, "Product-1", "1e9", "1e9");

}


const cities = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];