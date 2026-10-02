'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { green } from '@mui/material/colors'
import CheckIcon from '@mui/icons-material/Check'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import {
  SOURCE_ENV,
  DEST_ENV,
  GRANT_TYPES,
  DEFAULT_ENV_CONFIG,
  getEnvironmentConfigs,
  getEnvironmentConfig,
  saveEnvironmentConfig,
  testEnvironmentConnection,
  suggestAuthPath,
  getSessionToken,
  environmentLabel,
  getTransferEnvironments
} from '../../../lib/migrationStore'

// The global `button` rule in globals.css paints a gradient background-image
// over every <button>, MUI's included, so it's cleared here; the rest matches
// the app's own buttons.
function testButtonSx(success) {
  return {
    backgroundImage: 'none',
    boxShadow: 'none',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 'var(--radius)',
    padding: '9px 18px',
    '&:hover': { boxShadow: 'none' },
    ...(success && {
      bgcolor: green[500],
      '&:hover': { bgcolor: green[700], boxShadow: 'none' }
    })
  }
}

// Source and Destination IFS connections. The New Transfer wizard reads
// them from here and starts at Select Entities once both are configured.
export default function ConfigurationPage() {
  const router = useRouter()
  const [fromEnv, setFromEnv] = useState('')
  const [toEnv, setToEnv] = useState('')
  const [envModalOpen, setEnvModalOpen] = useState(false)
  const [modalTarget, setModalTarget] = useState('from') // 'from' | 'to'
  const [envConfigs, setEnvConfigs] = useState({})
  const [modalEnv, setModalEnv] = useState('')
  const [authForm, setAuthForm] = useState(DEFAULT_ENV_CONFIG)
  const [testStatus, setTestStatus] = useState('idle') // idle | testing | success | error
  const [testMessage, setTestMessage] = useState('')
  const [sessionTokenInfo, setSessionTokenInfo] = useState(null)

  const sameEnv = fromEnv && toEnv && fromEnv === toEnv
  const ready = fromEnv && toEnv && !sameEnv

  function envButtonStatus(env, role) {
    const config = env ? envConfigs[role] : null
    if (!env) return 'base'
    if (sameEnv) return 'error'
    if (config?.status === 'authorized') return 'success'
    if (config?.status === 'error') return 'error'
    return 'base'
  }

  const fromEnvStatus = envButtonStatus(fromEnv, SOURCE_ENV)
  const toEnvStatus = envButtonStatus(toEnv, DEST_ENV)
  const modalOtherEnv = modalTarget === 'from' ? toEnv : fromEnv
  const modalLabel = environmentLabel(authForm.baseUrl, modalEnv)
  const modalOtherLabel = modalTarget === 'from' ? 'destination' : 'source'

  useEffect(() => {
    setEnvConfigs(getEnvironmentConfigs())
    const saved = getTransferEnvironments()
    setFromEnv(saved.fromEnv)
    setToEnv(saved.toEnv)
  }, [])

  function loadEnvIntoForm(env) {
    const config = getEnvironmentConfig(env)
    setModalEnv(env)
    setAuthForm(config)
    setTestStatus(config.status === 'authorized' ? 'success' : config.status === 'error' ? 'error' : 'idle')
    setTestMessage(config.status === 'error' ? config.lastError || '' : '')
    setSessionTokenInfo(getSessionToken(env))
  }

  function openEnvModal(target) {
    setModalTarget(target)
    loadEnvIntoForm(target === 'from' ? SOURCE_ENV : DEST_ENV)
    setEnvModalOpen(true)
  }

  function updateAuthField(field, value) {
    setAuthForm((prev) => {
      const next = { ...prev, [field]: value }
      // The authorization path follows the Base URL until the user edits it
      // themselves (a hand-typed path is never overwritten).
      if (field === 'baseUrl' && (!prev.authPath || prev.authPath === suggestAuthPath(prev.baseUrl))) {
        next.authPath = suggestAuthPath(value)
      }
      return next
    })
    setTestStatus('idle')
    setTestMessage('')
  }

  async function handleTestConnection() {
    setTestStatus('testing')
    const result = await testEnvironmentConnection(modalEnv, authForm)
    if (result.success) {
      setTestStatus('success')
      setTestMessage(result.tokenPreview)
      setSessionTokenInfo(getSessionToken(modalEnv))
    } else {
      setTestStatus('error')
      setTestMessage(result.error)
      setSessionTokenInfo(null)
    }
  }

  function handleSaveEnvConfig() {
    const status = testStatus === 'success' ? 'authorized' : testStatus === 'error' ? 'error' : 'unconfigured'
    const saved = saveEnvironmentConfig(modalEnv, {
      ...authForm,
      status,
      lastError: testStatus === 'error' ? testMessage : null,
      lastTestedAt: testStatus === 'success' || testStatus === 'error' ? new Date().toISOString() : null
    })
    setEnvConfigs((prev) => ({ ...prev, [modalEnv]: saved }))
    const label = environmentLabel(saved.baseUrl, modalEnv)
    if (modalTarget === 'from') setFromEnv(label)
    else setToEnv(label)
    if (label !== modalOtherEnv) setEnvModalOpen(false)
  }

  return (
    <>
      <header>
        <div>
          <span className="eyebrow">CONFIGURATION</span>
          <h1>Environments</h1>
          <p>Connect the source and destination IFS environments. New Transfer uses them for every run.</p>
        </div>
      </header>

      <div className="panel">
        <h2>Configure Transfer</h2>
        <p className="login-sub" style={{ marginTop: -6 }}>Select the source and destination environments.</p>

        <div className="env-row">
          <label>
            Source Environment
            <button
              type="button"
              className={`env-select-btn env-status-${fromEnvStatus}`}
              onClick={() => openEnvModal('from')}
            >
              {fromEnvStatus === 'success' && <CheckCircleOutlineIcon fontSize="small" />}
              {fromEnvStatus === 'error' && <ErrorOutlineIcon fontSize="small" />}
              <span>{fromEnv || 'Select environment'}</span>
            </button>
          </label>
          <span className="env-arrow">→</span>
          <label>
            Destination Environment
            <button
              type="button"
              className={`env-select-btn env-status-${toEnvStatus}`}
              onClick={() => openEnvModal('to')}
            >
              {toEnvStatus === 'success' && <CheckCircleOutlineIcon fontSize="small" />}
              {toEnvStatus === 'error' && <ErrorOutlineIcon fontSize="small" />}
              <span>{toEnv || 'Select environment'}</span>
            </button>
          </label>
        </div>
        {sameEnv && <div className="error">Source and destination environments must be different.</div>}

        <Dialog className="app-dialog" open={envModalOpen} onClose={() => setEnvModalOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Configure {modalTarget === 'from' ? 'source' : 'destination'} environment (IFS API)</DialogTitle>
          <DialogContent>
            <p className="login-sub" style={{ marginTop: -4 }}>
              These settings define how the tool authorizes against the IFS Cloud REST API for this
              environment before issuing GET requests to fetch entities.
            </p>

            {modalOtherEnv && modalLabel === modalOtherEnv && (
              <div className="error" style={{ marginTop: 10 }}>
                {modalLabel} is already configured as the {modalOtherLabel} environment.
              </div>
            )}

            <div className="env-form">
              <label>
                Base URL
                <input
                  type="text"
                  placeholder="https://ifscloud.yourorganization.com"
                  value={authForm.baseUrl}
                  onChange={(e) => updateAuthField('baseUrl', e.target.value)}
                />
              </label>

              <label>
                Authorization path
                <input
                  type="text"
                  placeholder="{Base URL}/auth/realms/{YourNamespace}/protocol/openid-connect/token"
                  value={authForm.authPath}
                  onChange={(e) => updateAuthField('authPath', e.target.value)}
                />
                <small className="field-hint">
                  {'Filled in from the Base URL — replace {YourNamespace} with your own namespace, which you can find in Solution Manager > Setup > System Parameters > parameter "Namespace".'}
                </small>
              </label>

              <label>
                Grant type
                <select value={authForm.grantType} onChange={(e) => updateAuthField('grantType', e.target.value)}>
                  {GRANT_TYPES.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </label>

              <div className="env-form-pair">
                <label>
                  Client ID
                  <input
                    type="text"
                    placeholder="sebsa-migration-tool"
                    value={authForm.clientId}
                    onChange={(e) => updateAuthField('clientId', e.target.value)}
                  />
                </label>
                <label>
                  Client secret
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={authForm.clientSecret}
                    onChange={(e) => updateAuthField('clientSecret', e.target.value)}
                  />
                </label>
              </div>

              {authForm.grantType === 'password' && (
                <div className="env-form-pair">
                  <label>
                    Username
                    <input
                      type="text"
                      value={authForm.username}
                      onChange={(e) => updateAuthField('username', e.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(e) => updateAuthField('password', e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>

            {testStatus === 'success' && (
              <div className="auth-banner success">
                <CheckCircleOutlineIcon fontSize="small" />
                <span>Authorized successfully. {testMessage}</span>
              </div>
            )}
            {testStatus === 'error' && (
              <div className="auth-banner error">
                <ErrorOutlineIcon fontSize="small" />
                <span>{testMessage}</span>
              </div>
            )}
            {sessionTokenInfo && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                Session token cached for {modalEnv} — expires {new Date(sessionTokenInfo.expiresAt).toLocaleTimeString()}.
                It will be reused (no re-authorization) until then.
              </p>
            )}
          </DialogContent>
          <DialogActions>
            <button type="button" className="ghost" onClick={() => setEnvModalOpen(false)}>Cancel</button>
            {/* MUI "integrated with button" progress: spinner centred over the
                button while authorizing, button turns green once authorized. */}
            <Box sx={{ position: 'relative' }}>
              <Button
                variant="contained"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                startIcon={testStatus === 'success' ? <CheckIcon /> : null}
                aria-busy={testStatus === 'testing'}
                sx={testButtonSx(testStatus === 'success')}
              >
                {testStatus === 'success' ? 'Connected' : 'Test connection'}
              </Button>
              {testStatus === 'testing' && (
                <CircularProgress
                  size={24}
                  aria-label="Authorizing"
                  sx={{ color: green[500], position: 'absolute', top: '50%', left: '50%', mt: '-12px', ml: '-12px' }}
                />
              )}
            </Box>
            <button type="button" onClick={handleSaveEnvConfig}>
              Save &amp; use environment
            </button>
          </DialogActions>
        </Dialog>

        <div className="actions">
          <button onClick={() => router.push('/new-migration')} disabled={!ready}>
            Continue to New Transfer
          </button>
        </div>
      </div>
    </>
  )
}
