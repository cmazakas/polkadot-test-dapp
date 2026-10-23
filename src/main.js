import { decodeAddress, encodeAddress } from '@polkadot/util-crypto'

const WALLETS = ['brave-wallet', 'talisman']
const DAPP_NAME = 'polkadot wallet test dapp'

let wallet = null

// Addresses are re-encoded so they match the prefix-0 address in the sample
// payload below, rather than whatever prefix the extension happens to hand back.
const SS58_FORMAT = 0

const $ = (id) => document.getElementById(id)
const status = $('status')
const out = $('out')

const SAMPLE_PAYLOAD = {
  specVersion: "0x001e9808",
  transactionVersion: "0x0000000f",
  address: "16cM3vo8Ay8g9PxEaHFG2HZmZ8TYHf4gYAjBm3zAjezTCUMt",
  assetId: null,
  blockHash: "0xa4d849853e6d5f0df4e03b3fbc104d7937d8e85585fcbafa06290bfb4de081a9",
  blockNumber: "0x0148d3ac",
  era: "0xc400",
  genesisHash: "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
  metadataHash: null,
  method: "0x1f03051c000401000007093581e70e3001000003890dff6f1608140d01020800010100f8224098b97b27e917689228c41f23e2b06cc48666bc6eaec030169b441578400f0101010000040201090704000f00163982d4df06000d00040201090704000b00f0ab75a40d000101002a975dad1c0fb19221a9288a0ae4b63ed29f3c625a73578117dde65482b8fc23310201090704010200040201090704000f00268d0c30d20601040100040100000700e40b5402080d01020c0001030083cf32ace9e4c47165934f9a695fc23f96dee73d2ccb4f8d0d25b94af68380348f8eea289c3183f0f0bcb2a1fa2ee9ee89434eba012ccb4f8d0d25b94af68380348f8eea289c3183f0f0bcb2a1fa2ee9ee89434eba0103c83d82a9d2060300",
  mode: 0,
  nonce: "0x00000001",
  signedExtensions: [
    "AuthorizeCall",
    "CheckNonZeroSender",
    "CheckSpecVersion",
    "CheckTxVersion",
    "CheckGenesis",
    "CheckMortality",
    "CheckNonce",
    "CheckWeight",
    "ChargeAssetTxPayment",
    "PrevalidateAttests",
    "CheckMetadataHash",
    "EthSetOrigin",
    "StorageWeightReclaim",
    "UnitTransactionExtension",
    "VerifyMultiSignature",
    "AsPgas",
    "AsDotnsGateway",
    "RestrictOrigins"
  ],
  tip: "0x00000000000000000000000000000000",
  version: 4,
  withSignedTransaction: false
}

function show(value, isError = false) {
  out.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  out.className = isError ? 'err' : ''
}

// Extension errors are frequently plain strings or objects thrown across the
// page/content-script boundary, where `instanceof Error` no longer holds.
function describeError(e) {
  if (e instanceof Error) {
    return e.stack ?? `${e.name}: ${e.message}`
  }
  return typeof e === 'string' ? e : JSON.stringify(e, null, 2)
}

function injectedKeys() {
  return Object.keys(globalThis.injectedWeb3 ?? {})
}

function requireWallet() {
  if (!wallet) {
    throw new Error('No wallet selected — connect one first.')
  }
  return wallet
}

// Enable a single provider by name. web3Enable() cannot be used here: it fans out
// to every key in window.injectedWeb3 at once, so two extensions race to open an
// authorization popup and the loser is silently dropped from its result.
async function enableWallet(name) {
  const entry = globalThis.injectedWeb3?.[name]

  if (!entry) {
    throw new Error(`${name} is not in window.injectedWeb3`)
  }

  if (entry.connect) {
    return await entry.connect(DAPP_NAME)
  }

  if (!entry.enable) {
    throw new Error(`${name} exposes neither connect() nor enable()`)
  }

  const injected = await entry.enable(DAPP_NAME)
  return { name, version: entry.version ?? 'unknown', ...injected }
}

for (const name of WALLETS) {
  $(`connect-${name}`).addEventListener('click', async () => {
    status.textContent = `Enabling ${name}…`

    try {
      const extension = await enableWallet(name)
      wallet = extension
      show({
        'window.injectedWeb3': injectedKeys(),
        connected: {
          name: extension.name,
          version: extension.version,
          signer: Object.keys(extension.signer ?? {}),
        },
      })

      status.textContent = `${name} v${extension.version} connected.`
    } catch (e) {
      wallet = null
      status.textContent = `${name} did not enable.`
      show(describeError(e), true)
    }
  })
}

// A 42-character address is 0x-prefixed Ethereum-style and has no ss58 form.
function reencode(address) {
  return address.length === 42 ? address : encodeAddress(decodeAddress(address), SS58_FORMAT)
}

$('accounts').addEventListener('click', async () => {
  status.textContent = 'Listing accounts…'

  try {
    const { name, accounts } = requireWallet()
    const list = await accounts.get()
    const mapped = list.map((a) => ({ ...a, address: reencode(a.address) }))

    show(mapped.length ? mapped : `No accounts returned by ${name}.`)
    status.textContent = `${mapped.length} account(s).`
  } catch (e) {
    status.textContent = 'Account listing failed.'
    show(describeError(e), true)
  }
})

$('sign').addEventListener('click', async () => {
  let payload

  try {
    payload = JSON.parse($('payload').value)
  } catch (e) {
    status.textContent = 'Payload is not valid JSON.'
    show(describeError(e), true)
    return
  }

  status.textContent = 'Awaiting signature…'

  try {
    const { name, signer } = requireWallet()

    if (!signer?.signPayload) {
      throw new Error(`${name} exposes no signPayload`)
    }

    const result = await signer.signPayload(payload)

    show(result)
    status.textContent = 'Signed.'
  } catch (e) {
    status.textContent = 'Signing failed.'
    show(describeError(e), true)
  }
})

$('payload').value = JSON.stringify(SAMPLE_PAYLOAD, null, 2)
status.textContent = injectedKeys().length
  ? `Injected: ${injectedKeys().join(', ')}. Not connected.`
  : 'Nothing injected into window.injectedWeb3 yet.'
