import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, FormGroup, Input, Label } from 'reactstrap';
import {
  DATA_SPLITTING_DEFAULT_TRAINING_SPLIT,
  DATA_SPLITTING_TYPES,
  MODEL_TYPES,
  OUTCOME_CLASSIFICATION,
  OUTCOME_SURVIVAL_EVENT,
  PATIENT_FIELDS,
  TRAIN_TEST_SPLIT_TYPES,
} from './config/constants';

import _ from 'lodash';

import './DataSplitting.css';
import { usePrevious } from './utils/usePrevious';

export default function DataSplitting({
  dataSplittingType,
  updateDataSplittingType,
  trainTestSplitType,
  updateTrainTestSplitType,
  nbTrainingPatients,
  setNbTrainingPatients,
  dataPoints,
  selectedLabelCategory,
  outcomes,
  trainingPatients,
  testPatients,
  updateExtractionOrCollection,
  transferPatients,
}) {
  const handleSplitTypeChange = async (e) => {
    await updateTrainTestSplitType(e.target.id);
  };

  const handleDataSplitChange = async (e) => {
    await updateDataSplittingType(e.target.value);
  };

  const handleNbTrainingPatientsChange = async (e) => {
    setNbTrainingPatients(+e.target.value);
  };

  const prevOutcomes = usePrevious(outcomes);

  const patients = useMemo(() => {
    let trainingPatients;

    if (nbTrainingPatients === 0 || !outcomes || outcomes.length === 0) {
      return { trainingPatients: null, testPatients: null };
    }

    let filteredOutcomes = outcomes.filter((o) =>
      dataPoints.includes(o.patient_id)
    );

    // Stratify selection of patients (by Outcome for Classification, Event for Survival)
    let groupByCriteria =
      selectedLabelCategory.label_type === MODEL_TYPES.CLASSIFICATION
        ? 'label_content.Outcome'
        : 'label_content.Event';

    trainingPatients = _(filteredOutcomes)
      .groupBy(groupByCriteria)
      .map((v) =>
        _.sampleSize(
          v,
          Math.floor(v.length * (nbTrainingPatients / dataPoints.length))
        )
      )
      .flatten()
      .map((v) => v.patient_id)
      .value();

    let nbMaxTrainingPatients = Math.min(nbTrainingPatients, dataPoints.length);

    // Fill up with another patient if split does not produce exact number of requested patients
    if (trainingPatients.length < nbMaxTrainingPatients) {
      trainingPatients.push(
        _.sample(_.difference(dataPoints, trainingPatients))
      );
    }

    let testPatients = _.difference(dataPoints, trainingPatients);

    return { trainingPatients, testPatients };
  }, [dataPoints, outcomes, nbTrainingPatients, selectedLabelCategory]);

  const [selectedTrainingPatients, setSelectedTrainingPatients] = useState([]);
  const [selectedTestPatients, setSelectedTestPatients] = useState([]);

  const savePatients = useCallback(async () => {
    await updateExtractionOrCollection({
      [PATIENT_FIELDS.TRAINING]: patients.trainingPatients,
      [PATIENT_FIELDS.TEST]: patients.testPatients,
    });
  }, [patients, updateExtractionOrCollection]);

  const resetPatients = useCallback(async () => {
    await updateExtractionOrCollection({
      [PATIENT_FIELDS.TRAINING]: null,
      [PATIENT_FIELDS.TEST]: null,
    });
    setNbTrainingPatients(
      Math.round(dataPoints.length * DATA_SPLITTING_DEFAULT_TRAINING_SPLIT)
    );
  }, [updateExtractionOrCollection, setNbTrainingPatients, dataPoints]);

  // Initialize training & test patients as required
  useEffect(() => {
    async function initPatients() {
      if (selectedLabelCategory !== null && trainingPatients === null)
        await savePatients();
    }

    async function reinitPatients() {
      if (trainingPatients !== null) await resetPatients();
    }

    if (dataSplittingType !== DATA_SPLITTING_TYPES.FULL_DATASET) {
      initPatients();
    } else {
      reinitPatients();
    }
  }, [
    savePatients,
    resetPatients,
    trainingPatients,
    dataSplittingType,
    selectedLabelCategory,
  ]);

  // Update patients when outcomes change
  useEffect(() => {
    async function updatePatients() {
      await savePatients();
    }

    if (
      dataSplittingType !== DATA_SPLITTING_TYPES.FULL_DATASET &&
      !_.isEqual(outcomes, prevOutcomes) &&
      prevOutcomes !== undefined
    ) {
      console.log("outcomes changed, let's redo the patients");
      updatePatients();
    }
  }, [dataSplittingType, outcomes, prevOutcomes, savePatients]);

  if (!selectedLabelCategory || dataPoints.length === 0)
    return (
      <div>
        <h4>Data Splitting</h4>
        <Alert color="info">
          No Outcome is currently selected (or no patients have an outcome
          defined), therefore no data splitting is performed.
        </Alert>
      </div>
    );

  return (
    <div>
      <h4>Data Splitting</h4>
      <Form>
        <FormGroup tag="fieldset" className="d-flex">
          <FormGroup check className="flex-grow-1" style={{ flexBasis: 0 }}>
            <Label>
              <Input
                type="radio"
                name="model-validation"
                value={DATA_SPLITTING_TYPES.TRAIN_TEST_SPLIT}
                checked={
                  dataSplittingType !== DATA_SPLITTING_TYPES.FULL_DATASET
                }
                onChange={handleDataSplitChange}
              />{' '}
              Split the dataset into training & test sets
            </Label>
            <Alert color="secondary">
              <span>
                Using this mode, the data will be split into{' '}
                <strong>training</strong> & <strong>test</strong> sets. Test
                patients will not be shown in the visualization tab. Machine
                learning models are created using the training set only and are
                subsequently evaluated on the unseen test patients. Confidence
                Intervals (CIs) at 95 % are computed using bootstrap resampling
                (with N=1000 bootstraps).
              </span>
            </Alert>
          </FormGroup>
          <FormGroup check className="flex-grow-1 Splitting-choice">
            <Label>
              <Input
                type="radio"
                name="model-validation"
                value={DATA_SPLITTING_TYPES.FULL_DATASET}
                checked={
                  dataSplittingType === DATA_SPLITTING_TYPES.FULL_DATASET
                }
                onChange={handleDataSplitChange}
              />{' '}
              Explore entire dataset/collection ({dataPoints.length} patients)
            </Label>
            <Alert color="secondary">
              <span>
                Using this mode, you will be able to visualize the features of{' '}
                <strong>all patients</strong>. When creating machine learning
                models, evaluation metrics will be based on a stratified K-fold
                cross-validation of all available data.
              </span>
            </Alert>
          </FormGroup>
        </FormGroup>
      </Form>
      {dataSplittingType !== DATA_SPLITTING_TYPES.FULL_DATASET && (
        <>
          <h4>Training & Test Set Split</h4>

          <FormGroup tag="fieldset">
            <p>Splitting Method</p>
            <FormGroup check inline>
              <Input
                id={TRAIN_TEST_SPLIT_TYPES.AUTO}
                type="radio"
                checked={trainTestSplitType === TRAIN_TEST_SPLIT_TYPES.AUTO}
                onChange={handleSplitTypeChange}
              />
              <Label check for={TRAIN_TEST_SPLIT_TYPES.AUTO}>
                Automatic randomized split
              </Label>
            </FormGroup>
            <FormGroup check inline>
              <Input
                id={TRAIN_TEST_SPLIT_TYPES.MANUAL}
                type="radio"
                checked={trainTestSplitType === TRAIN_TEST_SPLIT_TYPES.MANUAL}
                onChange={handleSplitTypeChange}
              />
              <Label check for={TRAIN_TEST_SPLIT_TYPES.MANUAL}>
                Manual split
              </Label>
            </FormGroup>
          </FormGroup>

          {trainTestSplitType === TRAIN_TEST_SPLIT_TYPES.AUTO && (
            <FormGroup style={{ width: '66%' }} className="m-auto">
              <Input
                id="nb-training-patients-range"
                name="nbtrainingpatients"
                type="range"
                className="custom-range"
                value={nbTrainingPatients}
                onChange={handleNbTrainingPatientsChange}
                onMouseUp={savePatients}
                onKeyUp={savePatients}
                min={1}
                max={dataPoints.length - 1}
              />
              <Label
                for="train-test-split-range"
                className="d-flex flex-grow-1 justify-content-between"
              >
                <span>
                  Training : {nbTrainingPatients} patients (
                  {Math.round((nbTrainingPatients / dataPoints.length) * 100)}%)
                </span>
                <span>
                  Test : {dataPoints.length - nbTrainingPatients} patients (
                  {Math.round(
                    ((dataPoints.length - nbTrainingPatients) /
                      dataPoints.length) *
                      100
                  )}
                  %)
                </span>
              </Label>
            </FormGroup>
          )}

          {trainTestSplitType === TRAIN_TEST_SPLIT_TYPES.MANUAL && (
            <div className="d-flex align-items-center justify-content-center">
              <PatientSelectList
                title="Training Patients"
                patients={trainingPatients}
                selectedPatients={selectedTrainingPatients}
                setSelectedPatients={setSelectedTrainingPatients}
              />
              <div className="m-5">
                <Button
                  color="primary"
                  title="Transfer to Test"
                  onClick={() => {
                    transferPatients(
                      selectedTrainingPatients,
                      PATIENT_FIELDS.TRAINING,
                      PATIENT_FIELDS.TEST
                    );
                    setSelectedTrainingPatients([]);
                  }}
                  style={{ minWidth: 270 }}
                >
                  {`Transfer ${selectedTrainingPatients.length} patients to Test >>`}
                </Button>
                <br className="m-3" />
                <Button
                  color="primary"
                  title="Transfer to Training"
                  onClick={() => {
                    transferPatients(
                      selectedTestPatients,
                      PATIENT_FIELDS.TEST,
                      PATIENT_FIELDS.TRAINING
                    );
                    setSelectedTestPatients([]);
                  }}
                  style={{ minWidth: 270 }}
                >
                  {`<< Transfer ${selectedTestPatients.length} patients to Training`}
                </Button>
              </div>
              <PatientSelectList
                title="Test Patients"
                patients={testPatients}
                selectedPatients={selectedTestPatients}
                setSelectedPatients={setSelectedTestPatients}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatientSelectList({
  title,
  patients,
  selectedPatients,
  setSelectedPatients,
}) {
  const handleSelectionChange = (e) => {
    setSelectedPatients([...e.target.selectedOptions].map((p) => p.value));
  };

  const selectAll = () => setSelectedPatients(patients);
  const deselectAll = () => setSelectedPatients([]);

  if (!patients) return <div>Loading...</div>;

  return (
    <FormGroup>
      <Label>
        {title} ({patients.length})
        <Input
          type="select"
          multiple
          onChange={handleSelectionChange}
          value={selectedPatients}
          style={{ minHeight: 300 }}
        >
          {[...patients]
            .sort((p1, p2) =>
              p1.localeCompare(p2, undefined, { numeric: true })
            )
            .map((p) => (
              <option value={p} key={p}>
                {p}
              </option>
            ))}
        </Input>
      </Label>
      <div>
        <Button color="link" onClick={selectAll}>
          <small>Select All</small>
        </Button>
        <Button color="link" onClick={deselectAll}>
          <small>Deselect All</small>
        </Button>
      </div>
    </FormGroup>
  );
}
