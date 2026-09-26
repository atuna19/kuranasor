; ESKİ KISAYOL TEMİZLİĞİ (2026-09-21)
;
; Sorun: yeni sürüm gönderildikçe masaüstünde eski kısayollar birikiyordu.
; İki kaynağı var: (1) ürün/kısayol adı değişti, eski addaki kısayol kaldı;
; (2) kurulumda başka klasör seçildi, eski kurulumun kısayolu hedefiyle durdu.
;
; electron-builder kısayolları customInstall'dan ÖNCE yaratır
; (installSection.nsh), bu yüzden burada silmek yenisini bozmaz.
; $oldDesktopLink / $oldStartMenuLink önceki kurulumun kayıt defterindeki
; adından gelir (common.nsh → setLinkVars).

!macro eskiAdiSil ad
  ${ifNot} "${ad}.lnk" == "${SHORTCUT_NAME}.lnk"
    ${if} ${FileExists} "$DESKTOP\${ad}.lnk"
      Delete "$DESKTOP\${ad}.lnk"
      DetailPrint "Eski kısayol kaldırıldı: ${ad}"
    ${endIf}
    Delete "$SMPROGRAMS\${ad}.lnk"
    Delete "$SMPROGRAMS\${ad}\${ad}.lnk"
    RMDir "$SMPROGRAMS\${ad}"
  ${endIf}
!macroend

!macro customInstall
  ; 1) Önceki kurulumun kaydettiği ad — ad değiştiyse kısayolu masaüstünde kalır
  ${if} $oldDesktopLink != $newDesktopLink
  ${andIf} ${FileExists} "$oldDesktopLink"
    WinShell::UninstShortcut "$oldDesktopLink"
    Delete "$oldDesktopLink"
    DetailPrint "Eski masaüstü kısayolu kaldırıldı"
  ${endIf}
  ${if} $oldStartMenuLink != $newStartMenuLink
  ${andIf} ${FileExists} "$oldStartMenuLink"
    WinShell::UninstShortcut "$oldStartMenuLink"
    Delete "$oldStartMenuLink"
  ${endIf}

  ; 2) Bilinen eski adlar — kayıt defteri silinmiş ya da başka klasöre kurulmuş
  ;    olsa da bu kısayollar masaüstünde kalıyor


  ; Masaüstü hemen tazelensin
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
