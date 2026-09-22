'use client'

import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import StepConnector, { stepConnectorClasses } from '@mui/material/StepConnector'
import { styled } from '@mui/material/styles'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import CheckIcon from '@mui/icons-material/Check'

const BRAND_GRADIENT = 'linear-gradient(135deg, #17ABE6 0%, #6C5CE0 55%, #4C1D8C 100%)'

const StepConnectorStyled = styled(StepConnector)(() => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 22
  },
  [`&.${stepConnectorClasses.active} .${stepConnectorClasses.line}`]: {
    backgroundImage: BRAND_GRADIENT
  },
  [`&.${stepConnectorClasses.completed} .${stepConnectorClasses.line}`]: {
    backgroundImage: BRAND_GRADIENT
  },
  [`& .${stepConnectorClasses.line}`]: {
    height: 3,
    border: 0,
    backgroundColor: '#E4E8F1',
    borderRadius: 1
  }
}))

const StepIconRoot = styled('div')(({ ownerState }) => ({
  width: 44,
  height: 44,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94A0B8',
  backgroundColor: '#F0EEFD',
  border: '1.5px solid #DCD6F7',
  transition: 'all .2s ease',
  ...(ownerState.active && {
    backgroundImage: BRAND_GRADIENT,
    color: '#fff',
    border: 0,
    boxShadow: '0 4px 14px rgba(76,29,140,.28)'
  }),
  ...(ownerState.completed && {
    backgroundImage: BRAND_GRADIENT,
    color: '#fff',
    border: 0
  })
}))

const STEP_ICONS = {
  1: SettingsOutlinedIcon,
  2: FactCheckOutlinedIcon,
  3: CloudUploadOutlinedIcon
}

function MigrationStepIcon(props) {
  const { active, completed, icon } = props
  const Icon = STEP_ICONS[icon]

  return (
    <StepIconRoot ownerState={{ active, completed }}>
      {completed ? <CheckIcon fontSize="small" /> : <Icon fontSize="small" />}
    </StepIconRoot>
  )
}

export default function MigrationStepper({ steps, activeStep }) {
  return (
    <Stepper
      alternativeLabel
      activeStep={activeStep}
      connector={<StepConnectorStyled />}
      sx={{ marginBottom: '28px' }}
    >
      {steps.map((label) => (
        <Step key={label}>
          <StepLabel
            slots={{ stepIcon: MigrationStepIcon }}
            sx={{
              '& .MuiStepLabel-label': {
                fontWeight: 700,
                fontSize: 13,
                marginTop: '8px !important',
                color: '#6B7280'
              },
              '& .MuiStepLabel-label.Mui-active': { color: '#4C1D8C' },
              '& .MuiStepLabel-label.Mui-completed': { color: '#5B3FD6' }
            }}
          >
            {label}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  )
}
