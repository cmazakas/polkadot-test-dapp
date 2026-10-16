import { web3Accounts, web3Enable, web3FromSource } from '@polkadot/extension-dapp'

const WALLET = 'brave-wallet'
const DAPP_NAME = 'brave-wallet test dapp'

// web3Accounts re-encodes every address and falls back to prefix 42 when this is
// unset, which would not match the prefix-0 address in the sample payload below.
const SS58_FORMAT = 0

const $ = (id) => document.getElementById(id)
const status = $('status')
const out = $('out')

const SAMPLE_PAYLOAD = {
  specVersion: '0x001e9808',
  transactionVersion: '0x0000000f',
  address: '16cM3vo8Ay8g9PxEaHFG2HZmZ8TYHf4gYAjBm3zAjezTCUMt',
  assetId: null,
  blockHash: '0x5cc4fd7a625a879bfa71e9a75df3a0dc9b359bab022b97f75e0edd2a97ea2abe',
  blockNumber: '0x0144bba3',
  era: '0x3400',
  genesisHash: '0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f',
  metadataHash: null,
  method:
    '0x1f03051800040100000778f43aa9013001000003ac9fc66f1608140d01020800010100f8224098b97b27e917689228c41f23e2b06cc48666bc6eaec030169b441578400f0101010000040201090704000b00a84e4563b000310201090704010200040201090704000b00a84e4563b0010401000401000002093d00080d01020c0001030083cf32ace9e4c47165934f9a695fc23f96dee73d2ce2eb75ae63c3408d4ac42de834f1f0f9f93cd2d6de2bc53355549c006002c5852ce2eb75ae63c3408d4ac42de834f1f0f9f93cd2d6de2bc53355549c006002c58503aedf2e980ebf0200',
  mode: 0,
  nonce: '0x00000000',
  signedExtensions: [
    'AuthorizeCall', 'CheckNonZeroSender', 'CheckSpecVersion', 'CheckTxVersion',
    'CheckGenesis', 'CheckMortality', 'CheckNonce', 'CheckWeight',
    'ChargeAssetTxPayment', 'PrevalidateAttests', 'CheckMetadataHash',
    'EthSetOrigin', 'StorageWeightReclaim', 'UnitTransactionExtension',
    'VerifyMultiSignature', 'AsPgas', 'AsDotnsGateway', 'RestrictOrigins',
  ],
  tip: '0x00000000000000000000000000000000',
  version: 4,
  withSignedTransaction: true,
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

$('connect').addEventListener('click', async () => {
  status.textContent = 'Enabling…'

  try {
    const extensions = await web3Enable(DAPP_NAME)
    console.log(extensions)
    const found = extensions.find((e) => e.name === WALLET)
    show({
      'window.injectedWeb3': injectedKeys(),
      enabled: extensions.map(({ name, version }) => ({ name, version })),
      [WALLET]: found
        ? { version: found.version, signer: Object.keys(found.signer) }
        : 'not enabled',
    })

    status.textContent = found
      ? `${WALLET} v${found.version} connected.`
      : `${WALLET} did not enable.`
  } catch (e) {
    status.textContent = 'Enable failed.'
    show(describeError(e), true)
  }
})

$('accounts').addEventListener('click', async () => {
  status.textContent = 'Listing accounts…'

  try {
    const accounts = await web3Accounts({ extensions: [WALLET], ss58Format: SS58_FORMAT })

    if (!accounts.length) {
      // web3Accounts swallows a throwing accounts.get() and reports an empty list,
      // so ask the extension directly to find out whether it failed or is just empty.
      const { accounts: raw } = await web3FromSource(WALLET)
      await raw.get()
    }

    show(accounts.length ? accounts : `No accounts returned by ${WALLET}.`)
    status.textContent = `${accounts.length} account(s).`
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
    const { signer } = await web3FromSource(WALLET)

    if (!signer.signPayload) {
      throw new Error(`${WALLET} exposes no signPayload`)
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
