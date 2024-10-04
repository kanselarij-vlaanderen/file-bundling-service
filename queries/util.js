
const parseSparqlResults = (data) => {
  if (!data) return;
  const vars = data.head.vars;
  return data.results.bindings.map((binding) => {
    const obj = {};
    vars.forEach((varKey) => {
      if (binding[varKey]) {
        obj[varKey] = binding[varKey].value;
      }
    });
    return obj;
  });
};

const sparqlQueryWithRetry = async (sparqlMethod, queryString, attempt = 0) => {
  try {
    return await sparqlMethod(queryString);
  } catch (ex) {
    if (attempt < 5) {
      // Hardcoded, we want to use the template functionality anyway once it's working instead of making our own solution here
      attempt += 1;
      const sleepTime = 2000;
      console.log(`Query failed, sleeping ${sleepTime} ms before next attempt`);
      await new Promise(r => setTimeout(r, sleepTime));
      return await sparqlQueryWithRetry(sparqlMethod, queryString, attempt);
    } else {
      console.log(`Failed query:
        ${queryString}`);
      throw ex;
    }
  }
}

export {
  parseSparqlResults,
  sparqlQueryWithRetry,
};
