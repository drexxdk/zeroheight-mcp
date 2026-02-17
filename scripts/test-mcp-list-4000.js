(async () => {
  try {
    const url = "http://localhost:4000/api/mcp/";
    const key = "uVqtSSDTRvKs3lkgc04pb4t6f77W89WDgFpEJJw0U577HFag57";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: 1,
      }),
    });
    const text = await res.text();
    console.log("STATUS", res.status);
    console.log(text);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
