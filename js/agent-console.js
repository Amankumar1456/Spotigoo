// js/agent-console.js
// A manual "Tool Tester" panel. This is NOT a fake agent — it does not pretend
// to reason or chat. It's a thin harness that lets a human directly invoke any
// registered WebMCP tool with raw JSON input and see the exact structured
// result, using the SAME execute() closures the real agent would call through
// document.modelContext. This is how you demo and verify tool behavior (e.g.
// that submit_report really does refuse an unconfirmed draft) without needing
// a live ChatGPT session attached during development.

export function mountToolTester(root, tools) {
  root.innerHTML = `
    <div class="tool-tester">
      <label for="tool-select">Tool</label>
      <select id="tool-select" aria-describedby="tool-desc"></select>
      <p id="tool-desc" class="muted tool-desc"></p>
      <label for="tool-input">Input (JSON)</label>
      <textarea id="tool-input" rows="5" spellcheck="false"></textarea>
      <button id="tool-run" type="button">Run tool</button>
      <div id="tool-result" class="tool-result" aria-live="polite"></div>
    </div>
  `;

  const select = root.querySelector("#tool-select");
  const desc = root.querySelector("#tool-desc");
  const input = root.querySelector("#tool-input");
  const result = root.querySelector("#tool-result");
  const runBtn = root.querySelector("#tool-run");

  select.innerHTML = tools.map((t) => `<option value="${t.name}">${t.name}</option>`).join("");

  function exampleFor(tool) {
    const props = tool.inputSchema?.properties || {};
    const example = {};
    for (const [key, schema] of Object.entries(props)) {
      if (schema.enum) example[key] = schema.enum[0];
      else if (schema.type === "number") example[key] = 0;
      else if (schema.type === "boolean") example[key] = true;
      else example[key] = "";
    }
    return JSON.stringify(example, null, 2);
  }

  function updateForSelection() {
    const tool = tools.find((t) => t.name === select.value);
    desc.textContent = tool.description;
    input.value = exampleFor(tool);
    result.innerHTML = "";
  }

  select.addEventListener("change", updateForSelection);
  updateForSelection();

  runBtn.addEventListener("click", async () => {
    const tool = tools.find((t) => t.name === select.value);
    let parsed;
    try {
      parsed = input.value.trim() ? JSON.parse(input.value) : {};
    } catch (err) {
      result.innerHTML = `<p class="tool-result__error">Invalid JSON: ${err.message}</p>`;
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = "Running…";
    try {
      const output = await tool.execute(parsed);
      result.innerHTML = `<pre class="tool-result__ok">${JSON.stringify(output, null, 2)}</pre>`;
    } catch (err) {
      result.innerHTML = `<p class="tool-result__error">Error: ${err.message}</p>`;
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Run tool";
    }
  });
}
