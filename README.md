# 50 + 50 + 25 uitnodiging

Losse site voor het feest van Arjen & Christine. Deze map staat bewust apart van de bestaande NEOO projectadministratie.

## Lokaal draaien

```powershell
cd feest-uitnodiging-50-50-25
npm run dev
```

Open daarna:

- Uitnodiging: `http://localhost:5175`
- Aanmeldingen lokaal: `http://localhost:5175/?admin=local`

Lokale RSVP-data wordt bewaard in `.local-data/rsvps.json`; die map staat in `.gitignore`.
Per aanmelding kunnen maximaal 2 namen worden opgegeven. Gasten kiezen of ze de hele avond, alleen het walking dinner, alleen het feest of helaas niet komen.
De teller met aanwezigen is alleen zichtbaar via de admin-url.

## Vercel

Maak van deze map een eigen GitHub-repository en importeer die repository in Vercel.

Voor permanente RSVP-opslag in productie:

1. Maak in Vercel een KV database aan voor dit project.
2. Koppel de KV database aan het project, zodat `KV_REST_API_URL` en `KV_REST_API_TOKEN` beschikbaar zijn.
3. Voeg een eigen `ADMIN_SECRET` toe bij Environment Variables.
4. Open de stand via `https://jouw-vercel-url.vercel.app/?admin=ADMIN_SECRET`.

Zonder Vercel KV weigert de productie-API nieuwe aanmeldingen, zodat er geen schijnbare maar tijdelijke registraties ontstaan.

## WhatsApp preview

De preview gebruikt `assets/trouwkaart-2002.jpeg`. Zodra de Vercel-url definitief is, kun je eventueel de Open Graph image in `index.html` naar een absolute URL aanpassen.
