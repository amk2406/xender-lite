# Xender-lite Error Pages

Animated standalone **404** and **500** pages matching the Xender-lite dark theme.

## Files

| File       | Use                          |
|------------|------------------------------|
| `404.html` | Page not found / out of range |
| `500.html` | Internal server error         |

## Express usage

```js
const path = require('path');

// After all your routes...

// 404 – must be last non-error middleware
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'xender-error-pages', '404.html'));
});

// 500 – error handler (4 args)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).sendFile(path.join(__dirname, 'xender-error-pages', '500.html'));
});
```

## Features

- Dark theme + cyan accent (`#22D3EE`)
- Floating orb background animations
- Card entrance + icon bounce
- Buttons: Files, Upload, Go back / Retry
- Font Awesome icons
- Mobile-friendly

Place the `xender-error-pages` folder next to your server file, or adjust the path in `sendFile`.
