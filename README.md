# Panel de trabajo RRHH · I.Casanova

Panel de RRHH del CD Isidro Casanova (Grupo Gestión) con usuarios, permisos por módulo, cartelera y buzón compartidos.

> **Datos:** el repositorio es privado. No contiene nombres, DNI ni novedades de empleados: esos datos viven en la base de datos del servidor. La única tabla por legajo que está en el código es la de adicionales fijos del módulo F3 (número de legajo y porcentajes, sin nombres), en `frontend/src/f3.html`.

## Cómo está armado

```
frontend/
  src/           fuentes del panel (HTML, CSS y JS)
  build.py       arma el panel en un solo archivo: frontend/dist/index.html
backend/
  app/           servidor FastAPI: sesiones, permisos, datos de módulos, cartelera, buzón
  requirements.txt
render.yaml      configuración de referencia para Render
```

- **Abierto desde el servidor** (https): pide usuario y contraseña, y guarda todo en la base de datos compartida.
- **Abierto como archivo** (doble clic en `index.html`): funciona igual que antes, en modo local, con los datos en ese navegador.

## Permisos

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo: todos los módulos, usuarios y permisos, bandeja del buzón, anclar notas, registro de actividad |
| Usuario | Lo que le habilite el administrador en cada módulo |

Por módulo (Ausentismo, Vacaciones, Eventuales, Francos, Indumentaria, Novedades F3, Anticipos, Agenda):

- **—**: no ve el módulo.
- **Ver**: mira los datos y descarga informes. No carga archivos ni modifica.
- **Editar**: además carga archivos y modifica datos.

Cartelera, buzón y la fichada personal están disponibles para todos los usuarios.

## Variables de entorno (Render → Web Service → Environment)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Internal Database URL de la base Postgres |
| `JWT_SECRET` | Clave larga y aleatoria para firmar las sesiones |
| `ADMIN_USERNAME` | Usuario del primer administrador (por ejemplo `ariel`) |
| `ADMIN_NOMBRE` | Nombre que se muestra (por ejemplo `Flores, Ariel`) |
| `ADMIN_PASSWORD` | Contraseña inicial del primer administrador: se pide cambiarla al entrar |
| `PYTHON_VERSION` | `3.12.7` |

El primer administrador se crea solo la primera vez que arranca el servidor con la base vacía.

## Render

- **Build Command:** `pip install -r backend/requirements.txt && python frontend/build.py`
- **Start Command:** `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "*"`
- **Health Check Path:** `/api/health`

## Probar en la PC (opcional)

```
pip install -r backend/requirements.txt
python frontend/build.py
cd backend && uvicorn app.main:app --port 8000
```

Sin `DATABASE_URL` usa un archivo SQLite local y crea el usuario `admin` / `admin1234`.
