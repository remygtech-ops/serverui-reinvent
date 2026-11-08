; ServerUI starts a helper process (serverui-server.exe). Windows will not let the installer
; replace or remove a running executable, so stop it first. Harmless when it is not running.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM serverui-server.exe'
  Pop $0
  Sleep 500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM serverui-server.exe'
  Pop $0
  Sleep 500
!macroend
