export async function onRequestPost({ request, env }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  email = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Correo inválido.' }, 400);
  }

  // Límite simple: máx. 1 envío cada 60s por correo
  const rlKey = `rl:${email}`;
  if (await env.PORTAL_KV.get(rlKey)) {
    return json({ error: 'Espera un momento antes de pedir otro código.' }, 429);
  }

  // Generar código de 6 dígitos
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Guardar código en KV, expira en 10 minutos (600s)
  await env.PORTAL_KV.put(`code:${email}`, code, { expirationTtl: 600 });
  // Marcar rate-limit, expira en 60s
  await env.PORTAL_KV.put(rlKey, '1', { expirationTtl: 60 });

  // Enviar correo vía Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,            // ej. "WiFi <acceso@tudominio.com>"
      to: [email],
      subject: 'Tu código de acceso WiFi',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:auto">
          <h2>Código de acceso</h2>
          <p>Usa este código para conectarte al WiFi:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2563eb">${code}</p>
          <p style="color:#64748b;font-size:13px">Válido por 10 minutos. Si no lo solicitaste, ignora este correo.</p>
        </div>`
    })
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    console.log('Error Resend:', detail);
    return json({ error: 'No se pudo enviar el correo.' }, 502);
  }

  return json({ ok: true });
}
