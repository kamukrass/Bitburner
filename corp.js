/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("disableLog"); ns.disableLog("sleep");

	if (!ns.getPlayer().hasCorporation) {
		ns.corporation.createCorporation("MyCorp");
	}
	var corp = ns.corporation.getCorporation();
	if (corp.divisions.length < 1) {
		// initial Software Company setup
		// TODO: Switch from Software to Tobacco as initial division
		ns.corporation.expandIndustry("Software", "Software");
		ns.corporation.unlockUpgrade("Smart Supply");
		corp = ns.corporation.getCorporation();
		await upgradeCorp(ns);
		await initCities(ns, corp.divisions[0]);
		ns.corporation.sellMaterial(division.name, city, "AI Cores", "MAX", "MP");
	}

	//ns.corporation.expandIndustry("Food", "Food");
	//ns.print(ns.corporation.getCorporation().divisions);
	//await initCities(ns, ns.corporation.getCorporation().divisions[5]);

	while (true) {

		corp = ns.corporation.getCorporation();
		for (const division of corp.divisions) {

			ns.print("Division " + division.name);
			await upgradeHealth(ns, division);
			newProduct(ns, division);
			doResearch(ns, division);
		}
		if (corp.numShares == corp.totalShares) {
			if (corp.divisions[0].products.length > 2) {
				await trickInvest(ns, corp, corp.divisions[0]);
			}
		}
		await ns.sleep(5000);
	}
}

async function upgradeHealth(ns, division, productCity = "Sector-12") {
	for (const city of cities) {
		// check if warehouses are near max capacity and upgrade if needed
		var cityWarehouse = ns.corporation.getWarehouse(division.name, city);
		if (cityWarehouse.sizeUsed > 0.9 * cityWarehouse.size) {
			if (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeWarehouseCost(division.name, city)) {
				ns.print("WARN Upgrade warehouse in " + city);
				ns.corporation.upgradeWarehouse(division.name, city);
			}
		}
	}

	// Hire emnployees
	var employees = ns.corporation.getOffice(division.name, productCity).employees.length;
	while (ns.corporation.getCorporation().funds > (cities.length * ns.corporation.getOfficeSizeUpgradeCost(division.name, productCity, 3))) {
		ns.print("Upgrade office size for " + division.name);
		for (const city of cities) {
			ns.corporation.upgradeOfficeSize(division.name, city, 3);
			for (var i = 0; i < 3; i++) {
				await ns.corporation.hireEmployee(division.name, city);
			}
		}
	}
	if (ns.corporation.getOffice(division.name, productCity).employees.length > employees) {
		// set jobs after hiring people just in case we hire lots of people at once and setting jobs seems slow
		for (const city of cities) {
			employees = ns.corporation.getOffice(division.name, city).employees.length;
			if (ns.corporation.hasResearched(division.name, "Market-TA.II")) {
				// TODO: Simplify here. ProductCity config can always be used
				if (city == productCity) {
					await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", Math.ceil(employees / 5));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", Math.ceil(employees / 5));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Business", Math.ceil(employees / 5));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Management", Math.ceil(employees / 10));
					var remainingEmployees = employees - (3 * Math.ceil(employees / 5) + Math.ceil(employees / 10));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Training", Math.ceil(remainingEmployees));
				}
				else {
					await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", Math.floor(employees / 10));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 1);
					await ns.corporation.setAutoJobAssignment(division.name, city, "Business", Math.floor(employees / 5));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Management", Math.ceil(employees / 100));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", Math.ceil(employees / 2));
					var remainingEmployees = employees - (Math.floor(employees / 5) + Math.floor(employees / 10) + 1 + Math.ceil(employees / 100) + Math.ceil(employees / 2));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Training", Math.floor(remainingEmployees));
				}
			}
			else {
				if (city == productCity) {
					await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", Math.floor((employees - 2) / 2));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", Math.ceil((employees - 2) / 2));
					await ns.corporation.setAutoJobAssignment(division.name, city, "Management", 2);
				}
				else {
					await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", 1);
					await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 1);
					await ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", (employees - 2));
				}
			}
		}
	}

	// TODO: Upgrades need to be better automated; just an initial setup up to now. Move into a separate function and add some dynamic prioritization.
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("Project Insight")
		&& ns.corporation.getUpgradeLevel("Project Insight") < 20) {
		ns.print("Upgrade Project Insight to " + (ns.corporation.getUpgradeLevel("Project Insight") + 1));
		ns.corporation.levelUpgrade("Project Insight");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("Nuoptimal Nootropic Injector Implants")
		&& ns.corporation.getUpgradeLevel("Nuoptimal Nootropic Injector Implants") < 20) {
		ns.print("Upgrade Nuoptimal Nootropic Injector Implants to " + (ns.corporation.getUpgradeLevel("Nuoptimal Nootropic Injector Implants") + 1));
		ns.corporation.levelUpgrade("Nuoptimal Nootropic Injector Implants");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("Neural Accelerators")
		&& ns.corporation.getUpgradeLevel("Neural Accelerators") < 20) {
		ns.print("Upgrade Neural Accelerators to " + (ns.corporation.getUpgradeLevel("Neural Accelerators") + 1));
		ns.corporation.levelUpgrade("Neural Accelerators");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("FocusWires")
		&& ns.corporation.getUpgradeLevel("FocusWires") < 20) {
		ns.print("Upgrade FocusWires to " + (ns.corporation.getUpgradeLevel("FocusWires") + 1));
		ns.corporation.levelUpgrade("FocusWires");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("Speech Processor Implants")
		&& ns.corporation.getUpgradeLevel("Speech Processor Implants") < 20) {
		ns.print("Upgrade Speech Processor Implants to " + (ns.corporation.getUpgradeLevel("Speech Processor Implants") + 1));
		ns.corporation.levelUpgrade("Speech Processor Implants");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("DreamSense")
		&& ns.corporation.getUpgradeLevel("DreamSense") < 10) {
		ns.print("Upgrade DreamSense to " + (ns.corporation.getUpgradeLevel("DreamSense") + 1));
		ns.corporation.levelUpgrade("DreamSense");
	}
	while (ns.corporation.getCorporation().funds > ns.corporation.getUpgradeLevelCost("Smart Factories")
		&& ns.corporation.getUpgradeLevel("Smart Factories") < 20) {
		ns.print("Upgrade Smart Factories to " + (ns.corporation.getUpgradeLevel("Smart Factories") + 1));
		ns.corporation.levelUpgrade("Smart Factories");
	}
}

async function trickInvest(ns, division) {
	ns.print("Prepare to trick investors")
	for (const city of cities) {
		ns.corporation.sellMaterial(division.name, city, "AI Cores", "0", "MP");
	}
	var softwareProducts = division.products;
	for (var product of softwareProducts) {
		// stop selling products
		ns.corporation.sellProduct(division.name, "Sector-12", product, "0", "MP", true);
	}
	while (ns.corporation.getHireAdVertCount(division.name) < 9
		&& ns.corporation.getHireAdVertCost(division.name) < ns.corporation.getCorporation().funds) {
		ns.corporation.hireAdVert(division.name);
	}
	var refWarehouse = ns.corporation.getWarehouse(division.name, "Volhaven");
	ns.print("Wait for warehouses to fill up")
	//ns.print("Warehouse usage: " + refWarehouse.sizeUsed + " of " + refWarehouse.size);
	while (ns.corporation.getWarehouse(division.name, "Volhaven").sizeUsed <= (0.95 * refWarehouse.size)) {
		await ns.sleep(5000);
	}
	ns.print("Warehouses are full, start selling");

	var initialInvestFunds = ns.corporation.getInvestmentOffer().funds;
	ns.print("Initial investmant offer: " + initialInvestFunds);
	for (const city of cities) {
		// put all employees into business to sell as much as possible 
		const employees = ns.corporation.getOffice(division.name, city).employees.length;
		await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", 0);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 0);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Management", 0);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", 0);
		await ns.corporation.setAutoJobAssignment(division.name, city, "Business", (employees));
	}
	for (const city of cities) {
		ns.corporation.sellMaterial(division.name, city, "AI Cores", "MAX", "MP");
	}
	for (var product of softwareProducts) {
		// sell products again
		ns.corporation.sellProduct(division.name, "Sector-12", product, "MAX", "MP", true);
	}

	while (ns.corporation.getInvestmentOffer().funds < (4 * initialInvestFunds)) {
		// wait until the stored products are sold, which should lead to huge investment offers
		await ns.sleep(200);
	}
	ns.print("Accept investment offer for " + ns.corporation.getInvestmentOffer().funds)
	ns.corporation.acceptInvestmentOffer();

	for (const city of cities) {
		// set employees back to normal operation
		const employees = ns.corporation.getOffice(division.name, city).employees.length;
		await ns.corporation.setAutoJobAssignment(division.name, city, "Business", 0);
		if (city == "Sector-12") {
			await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", 1);
			await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", (employees - 2));
			await ns.corporation.setAutoJobAssignment(division.name, city, "Management", 1);
		}
		else {
			await ns.corporation.setAutoJobAssignment(division.name, city, "Operations", 1);
			await ns.corporation.setAutoJobAssignment(division.name, city, "Engineer", 1);
			await ns.corporation.setAutoJobAssignment(division.name, city, "Management", 0);
			await ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", (employees - 2));
		}
	}

	// with gained money, expand to the most profitable division
	ns.corporation.expandIndustry("Healthcare", "Healthcare");
	await initCities(ns, ns.corporation.getCorporation().divisions[1]);

}

function doResearch(ns, division) {
	// TODO: This function is an ugly copy & paste mess... put research + factors into an array and loop over it.
	const laboratory = "Hi-Tech R&D Laboratory"
	const marketTAI = "Market-TA.I";
	const marketTAII = "Market-TA.II";
	if (!ns.corporation.hasResearched(division.name, laboratory)) {
		if (division.research > ns.corporation.getResearchCost(division.name, laboratory)) {
			ns.print("Research " + laboratory);
			ns.corporation.research(division.name, laboratory);
		}
	}
	else if (!ns.corporation.hasResearched(division.name, marketTAII)) {
		var researchCost = ns.corporation.getResearchCost(division.name, marketTAI)
			+ ns.corporation.getResearchCost(division.name, marketTAII);

		if (division.research > researchCost * 1.1) {
			ns.print("Research " + marketTAI);
			ns.corporation.research(division.name, marketTAI);
			ns.print("Research " + marketTAII);
			ns.corporation.research(division.name, marketTAII);
			var softwareProducts = division.products;
			for (var product of softwareProducts) {
				ns.corporation.setProductMarketTA1(division.name, product, true);
				ns.corporation.setProductMarketTA2(division.name, product, true);
			}
			if (division.name == "Software") {
				for (const city of cities) {
					ns.corporation.setMaterialMarketTA1(division.name, city, "AI Cores", true);
					ns.corporation.setMaterialMarketTA2(division.name, city, "AI Cores", true);
				}
			}
		}
		return;
	}
	else if (!ns.corporation.hasResearched(division.name, "Overclock")) {
		if (division.research > 4 * ns.corporation.getResearchCost(division.name, "Overclock")) {
			ns.print("Research " + "Overclock");
			ns.corporation.research(division.name, "Overclock");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "uPgrade: Fulcrum")) {
		if (division.research > 10 * ns.corporation.getResearchCost(division.name, "uPgrade: Fulcrum")) {
			ns.print("Research " + "uPgrade: Fulcrum");
			ns.corporation.research(division.name, "uPgrade: Fulcrum");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "uPgrade: Capacity.I")) {
		if (division.research > 3 * ns.corporation.getResearchCost(division.name, "uPgrade: Capacity.I")) {
			ns.print("Research " + "uPgrade: Capacity.I");
			ns.corporation.research(division.name, "uPgrade: Capacity.I");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "uPgrade: Capacity.II")) {
		if (division.research > 4 * ns.corporation.getResearchCost(division.name, "uPgrade: Capacity.II")) {
			ns.print("Research " + "uPgrade: Capacity.II");
			ns.corporation.research(division.name, "uPgrade: Capacity.II");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "Self-Correcting Assemblers")) {
		if (division.research > 10 * ns.corporation.getResearchCost(division.name, "Self-Correcting Assemblers")) {
			ns.print("Research " + "Self-Correcting Assemblers");
			ns.corporation.research(division.name, "Self-Correcting Assemblers");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "Drones")) {
		if (division.research > 21 * ns.corporation.getResearchCost(division.name, "Drones")) {
			ns.print("Research " + "Drones");
			ns.corporation.research(division.name, "Drones");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "Drones - Assembly")) {
		if (division.research > 4 * ns.corporation.getResearchCost(division.name, "Drones - Assembly")) {
			ns.print("Research " + "Drones - Assembly");
			ns.corporation.research(division.name, "Drones - Assembly");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "Drones - Transport")) {
		if (division.research > 10 * ns.corporation.getResearchCost(division.name, "Drones - Transport")) {
			ns.print("Research " + "Drones - Transport");
			ns.corporation.research(division.name, "Drones - Transport");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "Automatic Drug Administration")) {
		if (division.research > 26 * ns.corporation.getResearchCost(division.name, "Automatic Drug Administration")) {
			ns.print("Research " + "Automatic Drug Administration");
			ns.corporation.research(division.name, "Automatic Drug Administration");
		}
	}
	else if (!ns.corporation.hasResearched(division.name, "CPH4 Injections")) {
		if (division.research > 10 * ns.corporation.getResearchCost(division.name, "CPH4 Injections")) {
			ns.print("Research " + "CPH4 Injections");
			ns.corporation.research(division.name, "CPH4 Injections");
		}
	}
}

function newProduct(ns, division) {
	var softwareProducts = division.products;
	ns.print("Products: " + softwareProducts);
	var productNumbers = [];
	for (var product of softwareProducts) {
		if (ns.corporation.getProduct(division.name, product).developmentProgress < 100) {
			ns.print("Product development in progress: " + ns.corporation.getProduct(division.name, product).developmentProgress);
			return false;
		}
		else {
			productNumbers.push(product.charAt(product.length - 1));
			// initial sell value if nothing is defined yet is 0
			if (ns.corporation.getProduct(division.name, product).sCost == 0) {
				ns.print("Start selling product " + product);
				ns.corporation.sellProduct(division.name, "Sector-12", product, "MAX", "MP", true);
				if (ns.corporation.hasResearched(division.name, "Market-TA.II")) {
					ns.corporation.setProductMarketTA1(division.name, product, true);
					ns.corporation.setProductMarketTA2(division.name, product, true);
				}
			}
		}
	}

	var numProducts = 3;
	// amount of products which can be sold in parallel is 3; can be upgraded
	if (ns.corporation.hasResearched(division.name, "uPgrade: Capacity.I")) {
		numProducts++;
		if (ns.corporation.hasResearched(division.name, "uPgrade: Capacity.II")) {
			numProducts++;
		}
	}

	if (productNumbers.length > numProducts) {
		// discontinue the oldest product if over max amount of products
		ns.print("Discontinue product " + softwareProducts[0]);
		ns.corporation.discontinueProduct(division.name, softwareProducts[0]);
	}

	// get the product number of the latest product and increase it by 1 for the mext product. Product names must be unique. 
	var newProductNumber = parseInt(productNumbers[productNumbers.length - 1]) + 1;
	// cap product numbers to one digit and restart at 0 if > 9.
	if (newProductNumber > 9) {
		newProductNumber = 0;
	}
	const newProductName = "Product-" + newProductNumber;
	ns.print("Start new product development " + newProductName);
	ns.corporation.makeProduct(division.name, "Sector-12", newProductName, "1e9", "1e9");
}

async function initCities(ns, division, productCity = "Sector-12") {
	for (const city of cities) {
		ns.print("Expand " + division.name +  " to City " + city);
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

		ns.corporation.upgradeWarehouse(division.name, city);
	}

	// get more employees in the main product development city
	const newEmployees = 6;
	ns.corporation.upgradeOfficeSize(division.name, productCity, newEmployees);
	for (var i = 0; i < newEmployees; i++) {
		await ns.corporation.hireEmployee(division.name, productCity);
	}
	await ns.corporation.setAutoJobAssignment(division.name, productCity, "Research & Development", 0);
	await ns.corporation.setAutoJobAssignment(division.name, productCity, "Operations", 2);
	await ns.corporation.setAutoJobAssignment(division.name, productCity, "Engineer", 5);
	await ns.corporation.setAutoJobAssignment(division.name, productCity, "Management", 2);

	ns.corporation.makeProduct(division.name, productCity, "Product-0", "1e9", "1e9");
}

async function upgradeCorp(ns) {

	ns.print("unlock upgrades");

	ns.corporation.levelUpgrade("Smart Factories");
	ns.corporation.levelUpgrade("Smart Storage");
	ns.corporation.levelUpgrade("DreamSense");
	ns.corporation.levelUpgrade("Wilson Analytics");
	ns.corporation.levelUpgrade("Project Insight");
	ns.corporation.levelUpgrade("ABC SalesBots");

	// upgrade employee stats
	ns.corporation.levelUpgrade("Nuoptimal Nootropic Injector Implants");
	ns.corporation.levelUpgrade("Speech Processor Implants");
	ns.corporation.levelUpgrade("Neural Accelerators");
	ns.corporation.levelUpgrade("FocusWires");

}

const cities = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];