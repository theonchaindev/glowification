module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'API token not configured' });

  try {
    const startRes = await fetch(
      'https://api.replicate.com/v1/models/stability-ai/stable-diffusion-img2img/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=55',
        },
        body: JSON.stringify({
          input: {
            image,
            prompt:
              'soft radiant golden illumination, cinematic golden glow effect, warm sunlight energy emanating from subject, gentle rim lighting on edges, subtle bloom on highlights, volumetric light scattering, golden hour color grade, HDR natural photography, subsurface scattering, realistic light physics, warm golden yellow aura fading outward',
            negative_prompt:
              'cartoon, anime, illustration, oil painting, neon glow, hard outline glow, overexposed, washed out, face distortion, extra limbs, blur, low detail, plastic skin, fake lighting, halos, color shift, deformed',
            prompt_strength: 0.38,
            num_inference_steps: 30,
            guidance_scale: 7.5,
          },
        }),
      }
    );

    const data = await startRes.json();
    if (data.error) throw new Error(data.error);

    // Prefer: wait may return a completed prediction immediately
    if (data.status === 'succeeded') {
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      return res.json({ url });
    }

    // Otherwise poll until done (up to ~50s)
    const pollUrl = data.urls?.get;
    if (!pollUrl) throw new Error('No poll URL in response');

    for (let i = 0; i < 22; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await pollRes.json();

      if (result.status === 'succeeded') {
        const url = Array.isArray(result.output) ? result.output[0] : result.output;
        return res.json({ url });
      }
      if (['failed', 'canceled'].includes(result.status)) {
        throw new Error(result.error || 'Generation failed');
      }
    }

    return res.status(504).json({ error: 'Generation timed out — please try again.' });
  } catch (err) {
    console.error('Glow API error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong' });
  }
};
