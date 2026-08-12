/**
 * core/exchange — the session broker. Empty until sessions exist.
 *
 * The one path between an agent's working folder and the database: open a
 * session, diff a submitted draft against its base, run the gates, reject a
 * stale base, land what passed. Execution records land immediately; spec
 * changes land as proposed and wait for a person. Keeping it in one module is
 * what makes "can an agent write past approval?" a question about one file.
 */
export {};
