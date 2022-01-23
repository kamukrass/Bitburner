export async function main(ns) {

	if (ns.args.length >= 2) {
		const sleeptime = ns.args[1];
		await ns.sleep(sleeptime);
	}

	const server = ns.args[0];

	if (ns.args.length >= 3) {
		await ns.hack(server, { stock: ns.args[2] });
	}
	else {
		await ns.hack(server);
	}

}