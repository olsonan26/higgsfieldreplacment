param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [switch]$IncludeProductionDetailing
)

$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null

$modelFiles = @(
  'diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors',
  'text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',
  'vae/ltx-2.5-video-vae-bf16.safetensors',
  'vae/ltx-2.5-audio-vae-bf16.safetensors',
  'latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
  'model_patches/ltx-2.5-duration-head-bf16.safetensors'
)

& uvx --from huggingface_hub==1.29.0 hf download Lightricks/LTX-2.5 @modelFiles --local-dir $resolvedDestination
if ($LASTEXITCODE -ne 0) {
  throw 'Model download failed. Accept the LTX-2.5 license and authenticate with a read-only Hugging Face token first.'
}

if ($IncludeProductionDetailing) {
  & uvx --from huggingface_hub==1.29.0 hf download Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler 'ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors' --local-dir (Join-Path $resolvedDestination 'loras')
  if ($LASTEXITCODE -ne 0) {
    throw 'Production-detailing model download failed. Its repository requires separate contact-sharing consent.'
  }
}

Write-Host "LTX-2.5 weights are ready at $resolvedDestination"
