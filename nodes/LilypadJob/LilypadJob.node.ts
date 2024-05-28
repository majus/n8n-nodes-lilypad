import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { isObject } from 'lodash';
import fetch from 'node-fetch';

export class LilypadJob implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Lilypad Job',
		name: 'lilypadJob',
		group: ['transform', 'output'],
		version: 1,
		description: 'Execute Lilypad job',
		icon: 'file:Lilypad.svg',
		defaults: {
			name: 'Lilypad Job',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'lilypadCredentialsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Module',
				name: 'module',
				type: 'string',
				required: true,
				default: 'ollama-pipeline:llama3-8b-lilypad1',
			},
			{
				displayName: 'Inputs',
				name: 'inputs',
				type: 'fixedCollection',
				default: [],
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'items',
						displayName: 'Input',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								required: true,
								default: '',
								description: 'Custom input name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								typeOptions: {
									rows: 4,
								},
								default: '',
								description: 'Custom input value',
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const outputs = [];
		const items = this.getInputData();
		// Variables could have different value for each item in case they contain an expression
		for (let index = 0; index < items.length; index++) {
			try {
				const module = this.getNodeParameter('module', index, '') as string;
				const inputs = this.getNodeParameter('inputs', index) as { items: object[] };
				const { key } = await this.getCredentials('lilypadCredentialsApi') as { key: string };
				const response = await fetch('http://js-cli-wrapper.lilypad.tech', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						pk: key,
						module,
						// @ts-ignore
						inputs: inputs.items?.map(({ name, value }) => {
							//TODO: Escape instad of just removing
							const sanitized = value.replace(/'/g, '');
							return `-i ${name}='${sanitized}'`;
						}).join(' '),
					}),
				});
				const json = await response.json();
				if (json.error) {
					const error = isObject(json.error) ? JSON.stringify(json.error) : json.error;
					throw new NodeOperationError(this.getNode(), error);
				}
				outputs.push({ json });
			} catch (error) {
				if (this.continueOnFail()) {
					const { json } = this.getInputData(index)[0];
					items.push({ json, error, pairedItem: index });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property, only append the itemIndex
						error.context.itemIndex = index;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex: index,
					});
				}
			}
		}
		return this.prepareOutputData(outputs);
	}
}
