/**
* Copies files in file list to all servers and returns an array of all servers
*/
export function getAllServers(ns) {
	var q = [];
	var serverDiscovered = [];

	q.push("home");
	serverDiscovered["home"] = true;

	while (q.length) {
		let v = q.shift();

		let edges = ns.scan(v);

		for (let i = 0; i < edges.length; i++) {
			if (!serverDiscovered[edges[i]]) {
				serverDiscovered[edges[i]] = true;
				q.push(edges[i]);
			}
		}
	}
	//delete serverDiscovered["home"];
	return Object.keys(serverDiscovered);
}