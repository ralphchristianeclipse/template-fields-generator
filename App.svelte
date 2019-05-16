<script>
  import { getFieldsFromTemplate, setClipboard, sleep } from "./utils";
  let notifications = [];
  const notificationTimeout = 5000;
  const notificationCopyMessage =
    "Description copied to clipboard. You can now paste it into Siebel";
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
    const notification = {
      id: +new Date(),
      message: notificationCopyMessage
    };
    notifications = [notification, ...notifications];
    await sleep(notificationTimeout);
    notifications = notifications.filter(n => n.id !== notification.id);
  };
</script>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: Helvetica, Arial, sans-serif;
  }
  main {
    font-family: sans-serif;
    text-align: center;
    margin: 20px;
  }
  input {
    width: 100%;
    display: block;
    border: 1px solid #000;
    padding: 10px 5px;
    margin: 10px auto 10px auto;
    outline: 0;
    transition: 0.3s ease-in-out;
  }
  input::placeholder {
    text-transform: uppercase;
  }
  input:focus {
    background: #222;
    color: white;
  }
  label {
    font-size: 20px;
    text-transform: uppercase;
    font-weight: bold;
  }
  button {
    border: 1px solid #000;
    outline: 0;
    padding: 20px 10px;
    font-weight: bold;
    font-size: 20px;
    cursor: pointer;
    background: #fff;
    transition: 0.3s ease-in-out;
  }
  button:hover {
    color: #fff;
    background: #000;
  }
  pre {
    border: 1px solid #000;
    padding: 20px;
    margin: 20px auto;
    text-align: left;
  }
  textarea {
    width: 100%;
    height: calc(100vh - 500px);
  }
  .notifications {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 20px;
    pointer-events: none;
  }
  .notification {
    padding: 10px;
    background: #000;
    color: white;
    position: absolute;
    left: 0;
    right: 0;
    margin: 0 auto;
    width: 40%;
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
  <div class="notifications">
    {#each notifications as notification (notification.id)}
      <div class="notification"> {notification.message} </div>
    {/each}
  </div>
</main>
