export async function onRequestPost({ request, env }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

  let email, code;
  try {
    ({ email, code } = await request.json());
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  email = (email || '').trim().toLowerCase();
  code = (code || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return json({ error: 'Datos inválidos.' }, 400);
  }

  const stored = await env.PORTAL_KV.get(`code:${email}`);
  if (!stored) {
    return json({ valid: false, error: 'El código expiró. Solicita uno nuevo.' }, 400);
  }
  if (stored !== code) {
    return json({ valid: false, error: 'Código incorrecto.' }, 400);
  }

  // Código correcto: borrarlo para que sea de un solo uso
  await env.PORTAL_KV.delete(`code:${email}`);

  return json({ valid: true });
}
