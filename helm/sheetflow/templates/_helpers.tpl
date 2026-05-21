{{- define "sheetflow.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sheetflow.labels" -}}
app.kubernetes.io/name: sheetflow
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "sheetflow.selectorLabels" -}}
app.kubernetes.io/name: sheetflow
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
