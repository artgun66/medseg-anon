"""Root URL routing. App URL includes are added per-phase as features land."""
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def root(_request):
    return JsonResponse(
        {
            "service": "medseg-backend",
            "phase": "2-inference-and-chat",
            "status": "ok",
        }
    )


def healthz(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("", root),
    path("healthz", healthz),
    path("admin/", admin.site.urls),
    path("api/catalog/", include("apps.catalog.urls", namespace="catalog")),
    path("api/downloads/", include("apps.downloads.urls", namespace="downloads")),
    path("api/models/", include("apps.models_registry.urls", namespace="models_registry")),
    path("api/threads/", include("apps.threads.urls", namespace="threads")),
    # OpenAI-compatible at root, so any OpenAI client works without a prefix change.
    path("v1/", include("apps.inference.urls", namespace="inference")),
    path("api/biomedparse/", include("apps.biomedparse.urls")),
    path("api/vessel/", include("apps.vessel_segmentation.urls")),
]
