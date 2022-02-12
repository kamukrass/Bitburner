export async function main(ns) {

	await ns.sleep(ns.args[1]);

	const server = ns.args[0];

	if (ns.args.length >= 3) {
		await ns.hack(server, { stock: ns.args[2] });
	}
	else {
		await ns.hack(server);
	}

}