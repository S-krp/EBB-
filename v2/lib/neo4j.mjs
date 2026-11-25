import neo4j from "neo4j-driver";
import { corridorGraph, memoryGraph, validateGraph } from "./graph.mjs";

const corridor = "ebb-permian-sourced-v2";

export function graphStore(env = process.env) {
  if (!env.NEO4J_URI) return memoryGraph();
  if (!env.NEO4J_USERNAME || !env.NEO4J_PASSWORD) throw new Error("Neo4j credentials are required");
  const driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD));
  const options = env.NEO4J_DATABASE ? { database: env.NEO4J_DATABASE } : {};
  let initialized;
  return {
    name: "Neo4j",
    async read() {
      initialized ??= (async () => {
        const session = driver.session(options);
        try {
          await session.executeWrite(async (tx) => {
            await tx.run(
              "UNWIND $nodes AS n MERGE (p:EBBV2Point {corridor: $corridor, id: n.id}) ON CREATE SET p += n",
              { corridor, nodes: corridorGraph.nodes },
            );
            await tx.run(
              `UNWIND $edges AS e
               MATCH (a:EBBV2Point {corridor: $corridor, id: e.from}), (b:EBBV2Point {corridor: $corridor, id: e.to})
               MERGE (a)-[s:EBBV2_SEGMENT {id: e.id}]->(b) ON CREATE SET s += e`,
              { corridor, edges: corridorGraph.edges },
            );
          });
        } finally {
          await session.close();
        }
      })().catch((error) => { initialized = undefined; throw error; });
      await initialized;
      const session = driver.session(options);
      try {
        const result = await session.executeRead(async (tx) => {
          const nodes = await tx.run(
            "MATCH (p:EBBV2Point {corridor: $corridor}) RETURN properties(p) AS properties ORDER BY p.id", { corridor },
          );
          const edges = await tx.run(
            `MATCH (:EBBV2Point {corridor: $corridor})-[s:EBBV2_SEGMENT]->(:EBBV2Point {corridor: $corridor})
             RETURN properties(s) AS properties ORDER BY s.id`, { corridor },
          );
          const read = (records) => records.map((r) => Object.fromEntries(
            Object.entries(r.get("properties")).map(([key, value]) => [key, neo4j.isInt(value) ? value.toNumber() : value]),
          ));
          return { nodes: read(nodes.records), edges: read(edges.records).map((edge) => ({ capacity: null, ...edge })) };
        });
        return validateGraph(result);
      } finally {
        await session.close();
      }
    },
  };
}
