<script>
  import { getFieldsFromTemplate, setClipboard, sleep } from "./utils";
  let currentTemplate = `name:
password:
  `;
  $: fields = getFieldsFromTemplate(currentTemplate);
  $: map = new Map(fields.map(field => [field, ""]));
  $: fieldsAndValues = Array.from(map);
  $: result = fieldsAndValues
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const cachedFunctions = new Map();
  const handleInput = field => {
    if (cachedFunctions.has(field)) return cachedFunctions.get(field);
    const handler = event => {
      map.set(field, event.target.value);
      map = new Map(map);
    };
    cachedFunctions.set(field, handler);
    return handler;
  };

  const handleClick = async () => {
    await setClipboard(result);
  };
</script>

<style>
  main {
    font-family: sans-serif;
    text-align: center;
  }
  input {
    display: block;
    border: 1px solid #000;
    width: 100%;
    padding: 10px 5px;
    margin-bottom: 10px;
    outline: 0;
  }
</style>

<main>
  <h3>Your Template Fields</h3>
  {#each fields as field (field)}
    <label for={field}>{field}</label>
    <input placeholder={field} on:input={handleInput(field)} />
  {:else}
    <h1>No Results</h1>
  {/each}
  <button on:click={handleClick}>Copy Description</button>
  <pre>{result}</pre>
  <h3>Put your template here</h3>
  <textarea bind:value={currentTemplate} rows="4" cols="100" />
</main>
