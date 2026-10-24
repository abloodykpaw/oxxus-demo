export const inviteEmailSubject = "Invitación a OXXUS Credit Solutions";

export const inviteEmailHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación OXXUS</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#142237;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7ebf1;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(145deg,#0b2a50,#1261bd);padding:28px 32px;text-align:center;">
              <div style="font-size:11px;letter-spacing:2px;color:#c8d9ec;margin-bottom:10px;">OXXUS CREDIT SOLUTIONS</div>
              <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;">Tu acceso al portal está listo</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#142237;">
                Has sido invitado a unirte al portal seguro de <strong>OXXUS Credit Solutions</strong>, donde podrás consultar tu expediente, documentos y avances de tu plan.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#728096;">
                Para activar tu cuenta, crea tu contraseña personal usando el botón de abajo. Este enlace es privado y expira por seguridad.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="border-radius:8px;background:#1769e0;">
                    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                      Activar mi cuenta
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#728096;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;">
                <a href="{{ .ConfirmationURL }}" style="color:#1769e0;">{{ .ConfirmationURL }}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e7ebf1;margin:24px 0;" />
              <p style="margin:0;font-size:11px;line-height:1.6;color:#728096;">
                Si no esperabas esta invitación, puedes ignorar este correo. Solo usuarios autorizados por OXXUS pueden acceder al sistema.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafbfd;padding:18px 32px;text-align:center;font-size:10px;color:#8490a1;">
              OXXUS Credit Solutions · Acceso seguro y confidencial
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const recoveryEmailSubject = "Crea tu contraseña en OXXUS Credit Solutions";

export const recoveryEmailHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#142237;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7ebf1;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(145deg,#0b2a50,#1261bd);padding:28px 32px;text-align:center;">
          <div style="font-size:11px;letter-spacing:2px;color:#c8d9ec;margin-bottom:10px;">OXXUS CREDIT SOLUTIONS</div>
          <h1 style="margin:0;font-size:24px;color:#ffffff;">Crea o restablece tu contraseña</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Recibimos una solicitud para configurar el acceso a tu cuenta de OXXUS.</p>
          <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#728096;">Usa el botón siguiente para definir tu contraseña. Si no solicitaste este correo, ignóralo.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
            <tr><td style="border-radius:8px;background:#1769e0;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Continuar</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:#1769e0;">{{ .ConfirmationURL }}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

