export function preferirRedireccionAuth(ancho: number, userAgent: string) {
  const dispositivoMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const navegadorIntegrado = /FBAN|FBAV|Instagram|Line|MicroMessenger|; wv\)/i.test(userAgent);
  return ancho <= 760 || dispositivoMovil || navegadorIntegrado;
}
